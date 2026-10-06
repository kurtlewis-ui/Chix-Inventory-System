import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../common/upload/upload.service';

/**
 * Unit tests for the stock-safety rules in ProductsService: restock,
 * reset-all-stock, undo stock movements, and reorder. These are the rules that
 * keep per-branch quantities correct and auditable. All run against a mocked
 * PrismaService (no database), matching the existing spec style.
 */
const USER = 'owner-1';

describe('ProductsService — stock safety', () => {
  let service: ProductsService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      product: { findMany: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
      branch: { findMany: jest.fn() },
      inventory: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      stockMovement: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        createManyAndReturn: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    // $transaction supports BOTH forms used in the service:
    //   - callback form: $transaction(async (tx) => ...)  -> run with prisma as tx
    //   - array form:    $transaction([p1, p2])           -> Promise.all
    mockPrisma.$transaction.mockImplementation(async (arg: any) =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UploadService, useValue: { uploadDataUrl: jest.fn(async (v: unknown) => v) } },
      ],
    }).compile();

    service = module.get(ProductsService);
    prisma = module.get(PrismaService);
  });

  // ---- restock -------------------------------------------------------------
  describe('restock', () => {
    it('refuses the WHOLE upload if any row references an unknown product/shop', async () => {
      // Known shop, but the product name doesn't match anything -> refuse all.
      prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Known Product' }]);
      prisma.branch.findMany.mockResolvedValue([{ id: 'b1', name: 'Shop A' }]);

      await expect(
        service.restock(
          [{ productName: 'Ghost Product', branchName: 'Shop A', quantity: 5 }],
          USER,
        ),
      ).rejects.toThrow(/cancelled/i);

      // Nothing should have been written.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('adds stock and returns movement ids when all rows match', async () => {
      prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Known Product' }]);
      prisma.branch.findMany.mockResolvedValue([{ id: 'b1', name: 'Shop A' }]);
      // No existing inventory rows -> service will create them at 0 first.
      prisma.inventory.findMany.mockResolvedValue([]);
      prisma.stockMovement.createManyAndReturn.mockResolvedValue([{ id: 'm1' }]);

      const res = await service.restock(
        [{ productName: 'Known Product', branchName: 'Shop A', quantity: 5 }],
        USER,
      );

      expect(res.updated).toBe(1);
      expect(res.movementIds).toEqual(['m1']);
      // The quantityAfter for a brand-new row = 0 + 5.
      const movementArg = prisma.stockMovement.createManyAndReturn.mock.calls[0][0].data[0];
      expect(movementArg.quantityChange).toBe(5);
      expect(movementArg.quantityAfter).toBe(5);
    });

    it('sums duplicate (product, shop) rows into one addition', async () => {
      prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Known Product' }]);
      prisma.branch.findMany.mockResolvedValue([{ id: 'b1', name: 'Shop A' }]);
      prisma.inventory.findMany.mockResolvedValue([{ productId: 'p1', branchId: 'b1', quantity: 10 }]);
      prisma.stockMovement.createManyAndReturn.mockResolvedValue([{ id: 'm1' }]);

      const res = await service.restock(
        [
          { productName: 'Known Product', branchName: 'Shop A', quantity: 3 },
          { productName: 'Known Product', branchName: 'Shop A', quantity: 4 },
        ],
        USER,
      );

      expect(res.updated).toBe(1); // one (product, shop) target
      const movementArg = prisma.stockMovement.createManyAndReturn.mock.calls[0][0].data[0];
      expect(movementArg.quantityChange).toBe(7);        // 3 + 4 summed
      expect(movementArg.quantityAfter).toBe(17);        // existing 10 + 7
    });
  });

  // ---- resetAllStock -------------------------------------------------------
  describe('resetAllStock', () => {
    it('does nothing (cleared 0) when no row has stock', async () => {
      prisma.inventory.findMany.mockResolvedValue([]);
      const res = await service.resetAllStock(USER);
      expect(res.cleared).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('zeroes rows that have stock and logs one ADJUSTMENT per row', async () => {
      prisma.inventory.findMany.mockResolvedValue([
        { id: 'i1', productId: 'p1', branchId: 'b1', quantity: 8 },
        { id: 'i2', productId: 'p2', branchId: 'b1', quantity: 3 },
      ]);
      const res = await service.resetAllStock(USER);
      expect(res.cleared).toBe(2);
      // The movement rows record the negative change down to 0.
      const createManyArg = prisma.stockMovement.createMany.mock.calls[0][0].data;
      expect(createManyArg).toHaveLength(2);
      expect(createManyArg[0]).toMatchObject({ quantityChange: -8, quantityAfter: 0, type: 'ADJUSTMENT' });
    });
  });

  // ---- undoStockMovements --------------------------------------------------
  describe('undoStockMovements', () => {
    it('refuses to undo a SALE movement (only restock/adjustment allowed)', async () => {
      prisma.stockMovement.findUnique.mockResolvedValue({
        id: 'm1', type: 'SALE', productId: 'p1', branchId: 'b1', quantityChange: -2, description: 'Added orders.',
      });
      // All ids skipped -> the service throws with the first reason.
      await expect(service.undoStockMovements(['m1'], USER)).rejects.toThrow(/only restock or quantity-edit/i);
    });

    it('refuses to undo an entry that is itself an undo', async () => {
      prisma.stockMovement.findUnique.mockResolvedValue({
        id: 'm1', type: 'ADJUSTMENT', productId: 'p1', branchId: 'b1', quantityChange: 5, description: 'Undo: reverted a restock.',
      });
      await expect(service.undoStockMovements(['m1'], USER)).rejects.toThrow(/itself an undo/i);
    });

    it('refuses when the movement is NOT the most recent for its product/shop', async () => {
      const movement = { id: 'm1', type: 'RESTOCK', productId: 'p1', branchId: 'b1', quantityChange: 5, description: 'Restocked product.' };
      prisma.stockMovement.findUnique.mockResolvedValue(movement);
      // The latest row is a DIFFERENT (newer) movement.
      prisma.stockMovement.findFirst.mockResolvedValue({ id: 'm2' });
      await expect(service.undoStockMovements(['m1'], USER)).rejects.toThrow(/newer stock activity/i);
    });

    it('refuses when undoing would drive stock negative', async () => {
      const movement = { id: 'm1', type: 'RESTOCK', productId: 'p1', branchId: 'b1', quantityChange: 5, description: 'Restocked product.' };
      prisma.stockMovement.findUnique.mockResolvedValue(movement);
      prisma.stockMovement.findFirst.mockResolvedValue(movement); // it IS the latest
      // Current stock is 3; reversing a +5 would give -2.
      prisma.inventory.findUnique.mockResolvedValue({ quantity: 3 });
      await expect(service.undoStockMovements(['m1'], USER)).rejects.toThrow(/negative/i);
    });

    it('undoes a valid restock: reverses the quantity and appends an Undo movement', async () => {
      const movement = { id: 'm1', type: 'RESTOCK', productId: 'p1', branchId: 'b1', quantityChange: 5, description: 'Restocked product.' };
      prisma.stockMovement.findUnique.mockResolvedValue(movement);
      prisma.stockMovement.findFirst.mockResolvedValue(movement); // latest
      prisma.inventory.findUnique.mockResolvedValue({ quantity: 12 });

      const res = await service.undoStockMovements(['m1'], USER);

      expect(res.undone).toBe(1);
      expect(res.skipped).toHaveLength(0);
      // Stock set back to 12 - 5 = 7.
      expect(prisma.inventory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { quantity: 7 } }),
      );
      // A compensating ADJUSTMENT movement is written.
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'ADJUSTMENT', quantityChange: -5, quantityAfter: 7 }),
        }),
      );
    });
  });

  // ---- reorder -------------------------------------------------------------
  describe('reorder', () => {
    it('throws when none of the ids map to real products', async () => {
      prisma.product.findMany.mockResolvedValue([]); // no valid ids
      await expect(service.reorder(['x', 'y'], USER)).rejects.toThrow(/no valid products/i);
    });

    it('persists sortOrder for the valid ids in the given order', async () => {
      prisma.product.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      prisma.product.update.mockResolvedValue({});

      const res = await service.reorder(['a', 'b'], USER);

      expect(res).toEqual({ success: true, count: 2 });
      // index 0 -> 'a', index 1 -> 'b'
      expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { sortOrder: 0 } });
      expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { sortOrder: 1 } });
    });
  });
});
