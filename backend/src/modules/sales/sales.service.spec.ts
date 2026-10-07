import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentMethod } from '@prisma/client';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

/**
 * Unit tests for the money-critical sales rules. These guard the behaviour the
 * business relies on most: you can't oversell, can't double-approve, admins
 * can't tamper with a sale's contents, discounts/splits must be consistent,
 * and archived (globally or per-branch) products can't be sold.
 *
 * Everything is exercised against a mocked PrismaService (no real database), so
 * the tests run fast and anywhere, matching the existing auth.service.spec.ts
 * style.
 */

// Actors
const OWNER: RequestUser = { userId: 'owner-1', email: 'o@x.com', role: 'Owner', sessionId: 's1' };
const ADMIN: RequestUser = { userId: 'admin-1', email: 'a@x.com', role: 'Admin', sessionId: 's2' };
const STAFF: RequestUser = { userId: 'staff-1', email: 's@x.com', role: 'Staff', sessionId: 's3' };
const OTHER_STAFF: RequestUser = { userId: 'staff-2', email: 's2@x.com', role: 'Staff', sessionId: 's4' };
const VIEWER: RequestUser = { userId: 'viewer-1', email: 'v@x.com', role: 'Viewer', sessionId: 's5' };

const BRANCH_ID = '11111111-1111-1111-1111-111111111111';

// A product the branch can sell: active, active brand, not per-branch archived,
// priced via the branch's own inventory row.
function activeProduct(overrides: Partial<any> = {}) {
  return {
    id: 'prod-1',
    name: 'Blue Razz',
    sellingPrice: 100,
    costPrice: 40,
    brand: { name: 'RELX' },
    inventory: [{ sellingPrice: 120, archivedAt: null }],
    ...overrides,
  };
}

describe('SalesService', () => {
  let service: SalesService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      user: { findUnique: jest.fn() },
      product: { findMany: jest.fn() },
      branch: { findFirst: jest.fn() },
      sale: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      saleItem: { findMany: jest.fn() },
      auditLog: { create: jest.fn() },
      // $transaction(fn) runs the callback with a `tx` that reuses the same
      // mocks, so transactional logic (claims, stock restore) is exercised.
      $transaction: jest.fn(),
    };
    // Default: run the callback form of $transaction with `prisma` as `tx`.
    mockPrisma.$transaction.mockImplementation(async (arg: any) =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [SalesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(SalesService);
    prisma = module.get(PrismaService);
  });

  // ---- create: product availability --------------------------------------
  describe('create — product availability', () => {
    it('rejects when a product is archived or from an archived brand (not returned by the query)', async () => {
      prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID, deletedAt: null });
      // Caller asked for 1 product but the (archived-filtering) query returns 0.
      prisma.product.findMany.mockResolvedValue([]);

      await expect(
        service.create(
          { branchId: BRANCH_ID, items: [{ productId: 'prod-1', quantity: 1, paymentMethod: PaymentMethod.Cash }] },
          OWNER,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects selling a product that is per-branch archived at this branch', async () => {
      prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID, deletedAt: null });
      prisma.product.findMany.mockResolvedValue([
        activeProduct({ inventory: [{ sellingPrice: 120, archivedAt: new Date() }] }),
      ]);

      await expect(
        service.create(
          { branchId: BRANCH_ID, items: [{ productId: 'prod-1', quantity: 1, paymentMethod: PaymentMethod.Cash }] },
          OWNER,
        ),
      ).rejects.toThrow(/removed from this shop/i);
    });
  });

  // ---- create: discount + split validation --------------------------------
  describe('create — discount & split validation', () => {
    beforeEach(() => {
      prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID, deletedAt: null });
      prisma.product.findMany.mockResolvedValue([activeProduct()]);
    });

    it('rejects a discount larger than the line total', async () => {
      // Branch price 120 × qty 1 = 120 line total; discount 150 is too big.
      await expect(
        service.create(
          {
            branchId: BRANCH_ID,
            items: [{ productId: 'prod-1', quantity: 1, discount: 150, paymentMethod: PaymentMethod.Cash }],
          },
          OWNER,
        ),
      ).rejects.toThrow(/discount/i);
    });

    it('rejects a Split payment whose parts do not add up to the line subtotal', async () => {
      // subtotal = 120; split sums to 100 → must be rejected.
      await expect(
        service.create(
          {
            branchId: BRANCH_ID,
            items: [
              {
                productId: 'prod-1',
                quantity: 1,
                paymentMethod: PaymentMethod.Split,
                paymentSplit: { cash: 50, gcash: 50, bankTransfer: 0 },
              },
            ],
          },
          OWNER,
        ),
      ).rejects.toThrow(/add up/i);
    });

    it('requires split amounts when paymentMethod is Split', async () => {
      await expect(
        service.create(
          {
            branchId: BRANCH_ID,
            items: [{ productId: 'prod-1', quantity: 1, paymentMethod: PaymentMethod.Split }],
          },
          OWNER,
        ),
      ).rejects.toThrow(/split payment amounts are required/i);
    });
  });

  // ---- create: branch resolution for staff --------------------------------
  describe('create — branch resolution', () => {
    it('blocks the read-only Viewer role from creating a sale', async () => {
      await expect(
        service.create(
          { branchId: BRANCH_ID, items: [{ productId: 'prod-1', quantity: 1, paymentMethod: PaymentMethod.Cash }] },
          VIEWER,
        ),
      ).rejects.toThrow(/read-only/i);
    });

    it('rejects a staff with no assigned branch', async () => {
      prisma.user.findUnique.mockResolvedValue({ branch: null });
      await expect(
        service.create(
          { items: [{ productId: 'prod-1', quantity: 1, paymentMethod: PaymentMethod.Cash }] },
          STAFF,
        ),
      ).rejects.toThrow(/not assigned to a branch/i);
    });

    it('rejects a staff whose assigned branch is archived', async () => {
      prisma.user.findUnique.mockResolvedValue({ branch: { id: BRANCH_ID, deletedAt: new Date() } });
      await expect(
        service.create(
          { items: [{ productId: 'prod-1', quantity: 1, paymentMethod: PaymentMethod.Cash }] },
          STAFF,
        ),
      ).rejects.toThrow(/archived/i);
    });

    it('requires branchId for a non-staff actor', async () => {
      await expect(
        service.create(
          { items: [{ productId: 'prod-1', quantity: 1, paymentMethod: PaymentMethod.Cash }] },
          OWNER,
        ),
      ).rejects.toThrow(/branchId is required/i);
    });
  });

  // ---- approve -------------------------------------------------------------
  describe('approve', () => {
    it('rejects approving a sale that is not pending', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'APPROVED' });
      await expect(service.approve('sale-1', OWNER)).rejects.toThrow(BadRequestException);
    });

    it('rejects when the atomic claim finds nothing to approve (double-approve race)', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'PENDING', number: 3 });
      // Another request already flipped it: the conditional updateMany matches 0 rows.
      prisma.sale.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.approve('sale-1', OWNER)).rejects.toThrow(/already approved or declined/i);
    });

    it('throws NotFound when the sale does not exist', async () => {
      prisma.sale.findUnique.mockResolvedValue(null);
      await expect(service.approve('missing', OWNER)).rejects.toThrow(NotFoundException);
    });
  });

  // ---- update (edit a pending sale) ---------------------------------------
  describe('update — who may edit', () => {
    it('forbids an Admin from editing a sale', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'PENDING', staffId: STAFF.userId, items: [] });
      await expect(service.update('sale-1', { customerName: 'x' }, ADMIN)).rejects.toThrow(ForbiddenException);
    });

    it("forbids a Staff from editing another staff's sale", async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'PENDING', staffId: STAFF.userId, items: [] });
      await expect(service.update('sale-1', { customerName: 'x' }, OTHER_STAFF)).rejects.toThrow(ForbiddenException);
    });

    it('rejects editing a sale that is not pending', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'APPROVED', staffId: STAFF.userId, items: [] });
      await expect(service.update('sale-1', { customerName: 'x' }, OWNER)).rejects.toThrow(/only pending/i);
    });
  });

  // ---- delete --------------------------------------------------------------
  describe('remove', () => {
    it('refuses to delete an approved sale', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'APPROVED', staffId: STAFF.userId, items: [] });
      await expect(service.remove('sale-1', OWNER)).rejects.toThrow(/approved sales cannot be deleted/i);
    });

    it("forbids a staff from deleting another staff's pending sale", async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'PENDING', staffId: STAFF.userId, items: [] });
      await expect(service.remove('sale-1', OTHER_STAFF)).rejects.toThrow(ForbiddenException);
    });
  });
});
