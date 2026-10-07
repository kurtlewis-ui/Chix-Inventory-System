import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { QueryBrandDto } from './dto/query-brand.dto';
import { slugify } from '../../common/utils/string.util';
import { UploadService } from '../../common/upload/upload.service';

type BrandRow = {
  id: string;
  name: string;
  slug: string;
  coverImage: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  _count?: { products: number };
};

@Injectable()
export class BrandsService {
  constructor(
    private prisma: PrismaService,
    private upload: UploadService,
  ) {}

  async create(dto: CreateBrandDto, createdBy: string) {
    const name = dto.name.trim();

    const existing = await this.prisma.brand.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('A brand with that name already exists');
    }

    const coverImage = await this.upload.uploadDataUrl(dto.coverImage?.trim() || null, 'brands');

    const brand = await this.prisma.brand.create({
      data: {
        name,
        slug: slugify(name),
        coverImage: coverImage || null,
        isActive: dto.isActive ?? true,
      },
      include: { _count: { select: { products: true } } },
    });

    await this.audit(createdBy, 'BRAND_CREATED', brand.id, null, {
      name: brand.name,
    });

    return this.serialize(brand);
  }

  async findAll(query: QueryBrandDto) {
    const { page = 1, limit = 50, search, branchId } = query;
    const onlyBranchArchived = query.branchArchived === 'true';
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Per-branch brand archive filtering (only when a single branch is in view).
    // A brand is "removed from branch X" when it has a BranchBrandArchive row
    // for X.
    //   - Normal branch view: HIDE brands archived in this branch.
    //   - Branch Brand Archive page (onlyBranchArchived): show ONLY those.
    // No branchId (All Shops): don't apply — a brand archived in one branch is
    // still alive in others, so it should still appear.
    if (branchId) {
      if (onlyBranchArchived) {
        where.branchArchives = { some: { branchId } };
      } else {
        where.branchArchives = { none: { branchId } };
      }
    }

    const [total, brands] = await Promise.all([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({
        where,
        include: { _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    // Per-branch product counts. The default `_count.products` is global (every
    // product in the brand, branch-blind), which is what caused a brand to show
    // e.g. "2 products" while a branch actually sees none. When a branchId is
    // given, replace the count with the number of products ACTIVE IN THAT BRANCH
    // — the exact same rule the products list uses: product not globally
    // archived, and it has an inventory row for this branch that isn't
    // per-branch archived. Computed in ONE groupBy over the shown brands.
    let branchCounts: Map<string, number> | null = null;
    if (branchId) {
      const grouped = await this.prisma.product.groupBy({
        by: ['brandId'],
        where: {
          brandId: { in: brands.map((b) => b.id) },
          deletedAt: null,
          inventory: { some: { branchId, archivedAt: null } },
        },
        _count: { _all: true },
      });
      branchCounts = new Map(grouped.map((g) => [g.brandId, g._count._all]));
    }

    return {
      data: brands.map((b) =>
        this.serialize(b, branchCounts ? branchCounts.get(b.id) ?? 0 : undefined),
      ),
      pagination: this.paginate(page, limit, total),
    };
  }

  async findArchived(query: QueryBrandDto) {
    const { page = 1, limit = 50, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: { not: null } };
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [total, brands] = await Promise.all([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({
        where,
        include: { _count: { select: { products: true } } },
        orderBy: { deletedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: brands.map((b) => this.serialize(b)),
      pagination: this.paginate(page, limit, total),
    };
  }

  async findOne(id: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    return this.serialize(brand);
  }

  async update(id: string, dto: UpdateBrandDto, updatedBy: string, role?: string) {
    const current = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) {
      throw new NotFoundException('Brand not found');
    }

    // Admin may ONLY change the cover image. Ignore every other field they
    // send (name, isActive, …) regardless of the payload — enforced here so
    // the restriction holds even if the request is crafted by hand, not just
    // via the UI. Owner edits are unrestricted.
    const isAdminOnlyImage = role === 'Admin';

    const data: any = {};
    if (!isAdminOnlyImage && dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.toLowerCase() !== current.name.toLowerCase()) {
        const conflict = await this.prisma.brand.findFirst({
          where: {
            name: { equals: name, mode: 'insensitive' },
            deletedAt: null,
            NOT: { id },
          },
        });
        if (conflict) {
          throw new ConflictException('A brand with that name already exists');
        }
      }
      data.name = name;
      data.slug = slugify(name);
    }
    // Cover image is the ONLY field an Admin may change (and the Owner may too).
    if (dto.coverImage !== undefined) {
      data.coverImage = await this.upload.uploadDataUrl(dto.coverImage?.trim() || null, 'brands');
    }
    if (!isAdminOnlyImage && dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    const updated = await this.prisma.brand.update({
      where: { id },
      data,
      include: { _count: { select: { products: true } } },
    });

    await this.audit(
      updatedBy,
      'BRAND_UPDATED',
      id,
      { name: current.name, isActive: current.isActive },
      data,
    );

    return this.serialize(updated);
  }

  async remove(id: string, deletedBy: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
    });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    await this.prisma.brand.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit(deletedBy, 'BRAND_ARCHIVED', id, { name: brand.name }, null);

    return { message: 'Brand archived successfully' };
  }

  /**
   * Per-branch archive: "remove" a brand from ONE branch only. The brand (and
   * all its products) become hidden + unsellable in that branch, while staying
   * active in every other branch. Independent of the global archive and of the
   * per-branch PRODUCT archive. Owner + Admin.
   */
  async removeFromBranch(brandId: string, branchId: string, actorId: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id: brandId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const existing = await this.prisma.branchBrandArchive.findUnique({
      where: { brandId_branchId: { brandId, branchId } },
    });
    if (existing) {
      throw new BadRequestException('This brand is already removed from that branch.');
    }

    await this.prisma.branchBrandArchive.create({ data: { brandId, branchId } });

    await this.audit(actorId, 'BRAND_BRANCH_ARCHIVED', brandId, null, {
      name: brand.name,
      branchId,
      branchName: branch.name,
    });

    return { message: `Removed "${brand.name}" from ${branch.name}.` };
  }

  /**
   * Restore a brand that was per-branch archived back into ONE branch. Clears
   * the BranchBrandArchive row; the brand and its products reappear in that
   * branch — except any product that is itself still archived (globally or in
   * that branch), which keeps its own archived state.
   */
  async restoreToBranch(brandId: string, branchId: string, actorId: string) {
    const existing = await this.prisma.branchBrandArchive.findUnique({
      where: { brandId_branchId: { brandId, branchId } },
      include: {
        brand: { select: { id: true, name: true, deletedAt: true } },
        branch: { select: { id: true, name: true, deletedAt: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('No branch-archived brand found for that branch.');
    }
    if (existing.branch.deletedAt) {
      throw new BadRequestException('That branch is archived. Restore the branch first.');
    }
    if (existing.brand.deletedAt) {
      throw new BadRequestException('That brand is archived everywhere. Restore the brand first.');
    }

    await this.prisma.branchBrandArchive.delete({
      where: { brandId_branchId: { brandId, branchId } },
    });

    await this.audit(actorId, 'BRAND_BRANCH_RESTORED', brandId, null, {
      name: existing.brand.name,
      branchId,
      branchName: existing.branch.name,
    });

    return { message: `Restored "${existing.brand.name}" to ${existing.branch.name}.` };
  }

  async restore(id: string, restoredBy: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id, deletedAt: { not: null } },
    });
    if (!brand) {
      throw new NotFoundException('Archived brand not found');
    }

    const conflict = await this.prisma.brand.findFirst({
      where: {
        name: { equals: brand.name, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (conflict) {
      throw new ConflictException(
        'An active brand with that name already exists. Rename it before restoring.',
      );
    }

    const restored = await this.prisma.brand.update({
      where: { id },
      data: { deletedAt: null, isActive: true },
      include: { _count: { select: { products: true } } },
    });

    await this.audit(restoredBy, 'BRAND_RESTORED', id, null, {
      name: brand.name,
    });

    return this.serialize(restored);
  }

  // `branchProductCount`, when provided (a per-branch request), overrides the
  // global `_count.products` so the UI shows the count for the selected branch.
  private serialize(brand: BrandRow, branchProductCount?: number) {
    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      coverImage: brand.coverImage,
      isActive: brand.isActive,
      productCount: branchProductCount ?? brand._count?.products ?? 0,
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
      deletedAt: brand.deletedAt,
    };
  }

  private paginate(page: number, limit: number, total: number) {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
  }

  private audit(
    userId: string,
    action: string,
    entityId: string,
    oldValues: any,
    newValues: any,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType: 'Brand',
        entityId,
        oldValues: oldValues ?? undefined,
        newValues: newValues ?? undefined,
      },
    });
  }
}
