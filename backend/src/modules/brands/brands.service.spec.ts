import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BrandsService } from './brands.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../common/upload/upload.service';

/**
 * Unit tests for the per-branch brand archive rules in BrandsService:
 * removeFromBranch / restoreToBranch guards, and the per-branch count override
 * in findAll. Mocked Prisma + Upload — no database.
 */
const USER = 'owner-1';
const BRAND_ID = 'brand-1';
const BRANCH_ID = 'branch-1';

describe('BrandsService — per-branch archive', () => {
  let service: BrandsService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      brand: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      branch: { findFirst: jest.fn() },
      product: { groupBy: jest.fn() },
      branchBrandArchive: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UploadService, useValue: { uploadDataUrl: jest.fn(async (v: unknown) => v ?? null) } },
      ],
    }).compile();

    service = module.get(BrandsService);
    prisma = module.get(PrismaService);
  });

  // ---- removeFromBranch ----------------------------------------------------
  describe('removeFromBranch', () => {
    it('throws NotFound when the brand does not exist', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      await expect(service.removeFromBranch(BRAND_ID, BRANCH_ID, USER)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the branch does not exist', async () => {
      prisma.brand.findFirst.mockResolvedValue({ id: BRAND_ID, name: 'RELX' });
      prisma.branch.findFirst.mockResolvedValue(null);
      await expect(service.removeFromBranch(BRAND_ID, BRANCH_ID, USER)).rejects.toThrow(NotFoundException);
    });

    it('rejects when already removed from that branch', async () => {
      prisma.brand.findFirst.mockResolvedValue({ id: BRAND_ID, name: 'RELX' });
      prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID, name: 'Shop A' });
      prisma.branchBrandArchive.findUnique.mockResolvedValue({ id: 'bba-1' });
      await expect(service.removeFromBranch(BRAND_ID, BRANCH_ID, USER)).rejects.toThrow(/already removed/i);
    });

    it('creates the per-branch archive row on a valid remove', async () => {
      prisma.brand.findFirst.mockResolvedValue({ id: BRAND_ID, name: 'RELX' });
      prisma.branch.findFirst.mockResolvedValue({ id: BRANCH_ID, name: 'Shop A' });
      prisma.branchBrandArchive.findUnique.mockResolvedValue(null);
      prisma.branchBrandArchive.create.mockResolvedValue({});

      await service.removeFromBranch(BRAND_ID, BRANCH_ID, USER);

      expect(prisma.branchBrandArchive.create).toHaveBeenCalledWith({
        data: { brandId: BRAND_ID, branchId: BRANCH_ID },
      });
    });
  });

  // ---- restoreToBranch -----------------------------------------------------
  describe('restoreToBranch', () => {
    it('throws NotFound when there is no branch-archived row', async () => {
      prisma.branchBrandArchive.findUnique.mockResolvedValue(null);
      await expect(service.restoreToBranch(BRAND_ID, BRANCH_ID, USER)).rejects.toThrow(NotFoundException);
    });

    it('refuses when the branch itself is archived', async () => {
      prisma.branchBrandArchive.findUnique.mockResolvedValue({
        brand: { id: BRAND_ID, name: 'RELX', deletedAt: null },
        branch: { id: BRANCH_ID, name: 'Shop A', deletedAt: new Date() },
      });
      await expect(service.restoreToBranch(BRAND_ID, BRANCH_ID, USER)).rejects.toThrow(/branch is archived/i);
    });

    it('refuses when the brand is globally archived', async () => {
      prisma.branchBrandArchive.findUnique.mockResolvedValue({
        brand: { id: BRAND_ID, name: 'RELX', deletedAt: new Date() },
        branch: { id: BRANCH_ID, name: 'Shop A', deletedAt: null },
      });
      await expect(service.restoreToBranch(BRAND_ID, BRANCH_ID, USER)).rejects.toThrow(/archived everywhere/i);
    });

    it('deletes the archive row on a valid restore', async () => {
      prisma.branchBrandArchive.findUnique.mockResolvedValue({
        brand: { id: BRAND_ID, name: 'RELX', deletedAt: null },
        branch: { id: BRANCH_ID, name: 'Shop A', deletedAt: null },
      });
      prisma.branchBrandArchive.delete.mockResolvedValue({});

      await service.restoreToBranch(BRAND_ID, BRANCH_ID, USER);

      expect(prisma.branchBrandArchive.delete).toHaveBeenCalledWith({
        where: { brandId_branchId: { brandId: BRAND_ID, branchId: BRANCH_ID } },
      });
    });
  });

  // ---- findAll per-branch count + filtering --------------------------------
  describe('findAll — per-branch count & filtering', () => {
    it('hides brands archived in the branch and overrides counts per branch', async () => {
      prisma.brand.count.mockResolvedValue(1);
      prisma.brand.findMany.mockResolvedValue([
        { id: BRAND_ID, name: 'RELX', slug: 'relx', coverImage: null, isActive: true, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, _count: { products: 5 } },
      ]);
      // In this branch, only 2 of the brand's products are active.
      prisma.product.groupBy.mockResolvedValue([{ brandId: BRAND_ID, _count: { _all: 2 } }]);

      const res = await service.findAll({ branchId: BRANCH_ID } as any);

      // The brand query must exclude brands archived in this branch.
      const whereArg = prisma.brand.findMany.mock.calls[0][0].where;
      expect(whereArg.branchArchives).toEqual({ none: { branchId: BRANCH_ID } });
      // The serialized count is the per-branch count (2), not the global 5.
      expect(res.data[0].productCount).toBe(2);
    });

    it('uses the global count when no branch is selected', async () => {
      prisma.brand.count.mockResolvedValue(1);
      prisma.brand.findMany.mockResolvedValue([
        { id: BRAND_ID, name: 'RELX', slug: 'relx', coverImage: null, isActive: true, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, _count: { products: 5 } },
      ]);

      const res = await service.findAll({} as any);

      // No per-branch grouping, no branchArchives filter.
      expect(prisma.product.groupBy).not.toHaveBeenCalled();
      expect(prisma.brand.findMany.mock.calls[0][0].where.branchArchives).toBeUndefined();
      expect(res.data[0].productCount).toBe(5);
    });
  });
});
