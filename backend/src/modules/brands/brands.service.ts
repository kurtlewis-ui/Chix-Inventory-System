import {
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
    const { page = 1, limit = 50, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
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

    return {
      data: brands.map((b) => this.serialize(b)),
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

  async update(id: string, dto: UpdateBrandDto, updatedBy: string) {
    const current = await this.prisma.brand.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) {
      throw new NotFoundException('Brand not found');
    }

    const data: any = {};
    if (dto.name !== undefined) {
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
    if (dto.coverImage !== undefined) {
      data.coverImage = await this.upload.uploadDataUrl(dto.coverImage?.trim() || null, 'brands');
    }
    if (dto.isActive !== undefined) {
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

  private serialize(brand: BrandRow) {
    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      coverImage: brand.coverImage,
      isActive: brand.isActive,
      productCount: brand._count?.products ?? 0,
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
