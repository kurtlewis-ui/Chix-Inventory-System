import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../common/upload/upload.service';

/**
 * Unit tests for ProductsService core rules: create/update guards, the
 * Admin-is-image-only restriction, global archive/restore, per-branch archive
 * (remove/restore from one shop), and cost-price confidentiality in the
 * serialized output. Mocked Prisma + Upload — no database.
 */
const USER = 'owner-1';
const PRODUCT_ID = 'prod-1';
const BRANCH_ID = 'branch-1';

describe('ProductsService — core & per-branch archive', () => {
  let service: ProductsService;
  let prisma: any;

  // A fully-populated product row as returned by includeFull()/selectFull().
  function productRow(overrides: Partial<any> = {}) {
    return {
      id: PRODUCT_ID,
      name: 'Blue Razz',
      slug: 'blue-razz',
      image: null,
      sellingPrice: 100,
      costPrice: 40,
      quantityAlert: 0,
      sortOrder: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      brand: { id: 'b1', name: 'RELX', slug: 'relx' },
      inventory: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    const mockPrisma = {
      product: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
      brand: { findFirst: jest.fn() },
      branch: { findFirst: jest.fn(), count: jest.fn() },
      inventory: { findUnique: jest.fn(), update: jest.fn() },
      stockMovement: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    mockPrisma.$transaction.mockImplementation(async (arg: any) =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UploadService, useValue: { uploadDataUrl: jest.fn(async (v: unknown) => v ?? null) } },
      ],
    }).compile();

    service = module.get(ProductsService);
    prisma = module.get(PrismaService);
  });

  // ---- create --------------------------------------------------------------
  describe('create', () => {
    it('rejects when the brand does not exist', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ name: 'X', brandId: 'missing', sellingPrice: 10 } as any, USER, 'Owner'),
      ).rejects.toThrow(NotFoundException);
    });

    it('appends new products at the end (sortOrder = max + 1)', async () => {
      prisma.brand.findFirst.mockResolvedValue({ id: 'b1', name: 'RELX', deletedAt: null });
      prisma.product.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
      prisma.product.create.mockResolvedValue(productRow({ sortOrder: 5 }));

      await service.create({ name: 'X', brandId: 'b1', sellingPrice: 10 } as any, USER, 'Owner');

      expect(prisma.product.create.mock.calls[0][0].data.sortOrder).toBe(5);
    });
  });

  // ---- update (Admin is image-only) ---------------------------------------
  describe('update — Admin image-only', () => {
    it('ignores every non-image field when the actor is Admin', async () => {
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.product.update.mockResolvedValue(productRow());
      prisma.product.findUnique.mockResolvedValue(productRow());

      await service.update(
        PRODUCT_ID,
        { name: 'HACKED', sellingPrice: 1, costPrice: 1, quantityAlert: 99, image: 'data:img', quantities: [{ branchId: BRANCH_ID, quantity: 500 }] } as any,
        'admin-1',
        'Admin',
      );

      // Only `image` is written; name/price/cost/quantityAlert never reach the DB.
      const updateData = prisma.product.update.mock.calls[0][0].data;
      expect(Object.keys(updateData)).toEqual(['image']);
      expect(updateData.name).toBeUndefined();
      expect(updateData.sellingPrice).toBeUndefined();
      expect(updateData.costPrice).toBeUndefined();
    });

    it('rejects (brand not found) for an Owner editing with a bad brandId', async () => {
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.brand.findFirst.mockResolvedValue(null);
      await expect(
        service.update(PRODUCT_ID, { brandId: 'missing' } as any, USER, 'Owner'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---- global archive / restore -------------------------------------------
  describe('remove / restore (global)', () => {
    it('archives a product by setting deletedAt', async () => {
      prisma.product.findFirst.mockResolvedValue(productRow());
      prisma.product.update.mockResolvedValue(productRow({ deletedAt: new Date() }));

      await service.remove(PRODUCT_ID, USER);

      const data = prisma.product.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.isActive).toBe(false);
    });

    it('refuses to restore a product whose brand is still archived', async () => {
      prisma.product.findFirst.mockResolvedValue(
        productRow({ deletedAt: new Date(), brand: { id: 'b1', name: 'RELX', deletedAt: new Date() } }),
      );
      await expect(service.restore(PRODUCT_ID, USER, 'Owner')).rejects.toThrow(/brand is archived/i);
    });
  });

  // ---- per-branch archive (remove from one shop) --------------------------
  describe('removeFromBranch', () => {
    it('throws NotFound when the product does not exist', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.removeFromBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the branch does not exist', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'Blue Razz' });
      prisma.branch.findFirst.mockResolvedValue(null);
      await expect(service.removeFromBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(NotFoundException);
    });

    it('rejects when the product has no stock record at that branch', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'Blue Razz' });
      prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID, name: 'Shop A' });
      prisma.inventory.findUnique.mockResolvedValue(null);
      await expect(service.removeFromBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(/no stock record/i);
    });

    it('rejects when already removed from that branch', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'Blue Razz' });
      prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID, name: 'Shop A' });
      prisma.inventory.findUnique.mockResolvedValue({ archivedAt: new Date() });
      await expect(service.removeFromBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(/already removed/i);
    });

    it('sets archivedAt on the branch inventory row (keeping quantity)', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID, name: 'Blue Razz' });
      prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID, name: 'Shop A' });
      prisma.inventory.findUnique.mockResolvedValue({ archivedAt: null, quantity: 10 });
      prisma.inventory.update.mockResolvedValue({});

      await service.removeFromBranch(PRODUCT_ID, BRANCH_ID, USER);

      const data = prisma.inventory.update.mock.calls[0][0].data;
      expect(data.archivedAt).toBeInstanceOf(Date);
      // quantity is NOT touched (kept for restore).
      expect(data.quantity).toBeUndefined();
    });
  });

  describe('restoreToBranch', () => {
    it('throws NotFound when there is no branch-archived row', async () => {
      prisma.inventory.findUnique.mockResolvedValue(null);
      await expect(service.restoreToBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(NotFoundException);
    });

    it('refuses when the branch itself is archived', async () => {
      prisma.inventory.findUnique.mockResolvedValue({
        archivedAt: new Date(),
        product: { id: PRODUCT_ID, name: 'Blue Razz', deletedAt: null },
        branch: { id: BRANCH_ID, name: 'Shop A', deletedAt: new Date() },
      });
      await expect(service.restoreToBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(/branch is archived/i);
    });

    it('refuses when the product is globally archived', async () => {
      prisma.inventory.findUnique.mockResolvedValue({
        archivedAt: new Date(),
        product: { id: PRODUCT_ID, name: 'Blue Razz', deletedAt: new Date() },
        branch: { id: BRANCH_ID, name: 'Shop A', deletedAt: null },
      });
      await expect(service.restoreToBranch(PRODUCT_ID, BRANCH_ID, USER)).rejects.toThrow(/archived everywhere/i);
    });

    it('clears archivedAt on a valid restore', async () => {
      prisma.inventory.findUnique.mockResolvedValue({
        archivedAt: new Date(),
        product: { id: PRODUCT_ID, name: 'Blue Razz', deletedAt: null },
        branch: { id: BRANCH_ID, name: 'Shop A', deletedAt: null },
      });
      prisma.inventory.update.mockResolvedValue({});

      await service.restoreToBranch(PRODUCT_ID, BRANCH_ID, USER);

      expect(prisma.inventory.update.mock.calls[0][0].data).toEqual({ archivedAt: null });
    });
  });

  // ---- cost-price confidentiality -----------------------------------------
  describe('findAll — cost confidentiality', () => {
    it('includes costPrice for an Owner', async () => {
      prisma.product.count.mockResolvedValue(1);
      prisma.product.findMany.mockResolvedValue([productRow({ costPrice: 40 })]);
      const res = await service.findAll({} as any, 'Owner');
      expect(res.data[0]).toHaveProperty('costPrice', 40);
    });

    it('hides costPrice from a non-Owner (Admin)', async () => {
      prisma.product.count.mockResolvedValue(1);
      prisma.product.findMany.mockResolvedValue([productRow({ costPrice: 40 })]);
      const res = await service.findAll({} as any, 'Admin');
      expect(res.data[0]).not.toHaveProperty('costPrice');
    });
  });
});
