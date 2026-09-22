import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, DisposalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDisposalDto } from './dto/create-disposal.dto';
import { QueryDisposalDto } from './dto/query-disposal.dto';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import { businessDayRange } from '../../common/utils/business-day.util';

@Injectable()
export class DisposalsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Request a disposal. It starts as PENDING and stock is reserved (deducted)
   * immediately, same timing as Sale.create() — not at approval. Restored if
   * declined while still pending.
   */
  async create(dto: CreateDisposalDto, actor: RequestUser) {
    const branchId = await this.resolveBranchForActor(actor, dto.branchId);

    const product = await this.prisma.product.findFirst({
      // Block archived products AND products from an archived brand.
      where: { id: dto.productId, deletedAt: null, brand: { deletedAt: null } },
      include: { brand: { select: { name: true } } },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const unitPrice = new Prisma.Decimal(product.sellingPrice);
    const value = unitPrice.mul(dto.quantity);

    const disposal = await this.prisma.$transaction(async (tx) => {
      await this.reserveStock(tx, branchId, product.id, product.name, dto.quantity);

      const created = await tx.disposal.create({
        data: {
          branchId,
          productId: product.id,
          productName: product.name,
          brandName: product.brand.name,
          quantity: dto.quantity,
          unitPrice,
          value,
          reason: dto.reason?.trim() || null,
          status: DisposalStatus.PENDING,
          createdById: actor.userId,
        },
        include: this.includeFull(),
      });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'DISPOSAL_REQUESTED',
          entityType: 'Disposal',
          entityId: created.id,
          newValues: { product: product.name, quantity: dto.quantity },
        },
      });

      return created;
    });

    return this.serialize(disposal);
  }

  /**
   * Approve a pending disposal. Stock was already reserved at creation, so
   * this just flips the status.
   */
  async approve(id: string, actor: RequestUser) {
    const disposal = await this.prisma.disposal.findUnique({ where: { id } });
    if (!disposal) {
      throw new NotFoundException('Disposal not found');
    }
    if (disposal.status !== DisposalStatus.PENDING) {
      throw new BadRequestException(`Disposal is already ${disposal.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomically claim the disposal so concurrent approve() calls can't
      // both succeed.
      const claim = await tx.disposal.updateMany({
        where: { id, status: DisposalStatus.PENDING },
        data: {
          status: DisposalStatus.APPROVED,
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Disposal is already approved or declined');
      }

      const updated = await tx.disposal.findUnique({
        where: { id },
        include: this.includeFull(),
      });

      // Log the stock movement for disposal
      if (disposal.productId) {
        const inv = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: disposal.productId, branchId: disposal.branchId } },
        });
        await tx.stockMovement.create({
          data: {
            productId: disposal.productId,
            branchId: disposal.branchId,
            userId: actor.userId,
            type: 'DISPOSAL',
            quantityChange: -disposal.quantity,
            quantityAfter: inv?.quantity ?? 0,
            description: 'Disposed product.',
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'DISPOSAL_APPROVED',
          entityType: 'Disposal',
          entityId: id,
          newValues: { product: disposal.productName, quantity: disposal.quantity },
        },
      });

      return this.serialize(updated!);
    });
  }

  /** Decline a pending disposal and restore the stock reserved at request time. */
  async decline(id: string, actor: RequestUser) {
    const disposal = await this.prisma.disposal.findUnique({ where: { id } });
    if (!disposal) {
      throw new NotFoundException('Disposal not found');
    }
    if (disposal.status !== DisposalStatus.PENDING) {
      throw new BadRequestException(`Disposal is already ${disposal.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.disposal.updateMany({
        where: { id, status: DisposalStatus.PENDING },
        data: {
          status: DisposalStatus.DECLINED,
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Disposal is already approved or declined');
      }

      if (disposal.productId) {
        // Restore the reserved stock. Use upsert so that if the branch's
        // inventory row no longer exists (e.g. it was removed after the
        // disposal was created), the stock is still returned by recreating
        // the row — instead of an updateMany silently matching nothing and
        // losing the stock.
        await tx.inventory.upsert({
          where: {
            productId_branchId: {
              productId: disposal.productId,
              branchId: disposal.branchId,
            },
          },
          create: {
            productId: disposal.productId,
            branchId: disposal.branchId,
            quantity: disposal.quantity,
          },
          update: { quantity: { increment: disposal.quantity } },
        });
      }

      const updated = await tx.disposal.findUnique({ where: { id }, include: this.includeFull() });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'DISPOSAL_DECLINED',
          entityType: 'Disposal',
          entityId: id,
          newValues: { product: disposal.productName },
        },
      });

      return this.serialize(updated!);
    });
  }

  /** Same atomic conditional-UPDATE reservation pattern as SalesService. */
  private async reserveStock(
    tx: Prisma.TransactionClient,
    branchId: string,
    productId: string,
    productName: string,
    quantity: number,
  ) {
    const result = await tx.inventory.updateMany({
      where: { productId, branchId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (result.count === 0) {
      const inv = await tx.inventory.findUnique({
        where: { productId_branchId: { productId, branchId } },
      });
      throw new BadRequestException(
        `Insufficient stock to dispose "${productName}" (need ${quantity}, have ${inv?.quantity ?? 0})`,
      );
    }
  }

  async findAll(query: QueryDisposalDto, actor: RequestUser, status?: DisposalStatus) {
    const { page = 1, limit = 50, search, branchId, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DisposalWhereInput = {};
    if (status) where.status = status;

    if (actor.role === 'Staff') {
      const me = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { branchId: true },
      });
      where.branchId = me?.branchId ?? '00000000-0000-0000-0000-000000000000';
    } else if (branchId) {
      where.branchId = branchId;
    }

    if (startDate || endDate) {
      // PH business-day window (2 AM–2 AM) so disposals show on the correct
      // day's report regardless of server timezone. See business-day.util.
      where.createdAt = businessDayRange(startDate, endDate);
    }

    if (search) {
      where.OR = [
        { productName: { contains: search, mode: 'insensitive' } },
        { brandName: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, disposals, agg] = await Promise.all([
      this.prisma.disposal.count({ where }),
      this.prisma.disposal.findMany({
        where,
        include: this.includeFull(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.disposal.aggregate({ where, _sum: { value: true, quantity: true } }),
    ]);

    return {
      data: disposals.map((d) => this.serialize(d)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
      summary: {
        totalValue: Number(agg._sum.value ?? 0),
        totalQuantity: agg._sum.quantity ?? 0,
        count: total,
      },
    };
  }

  private async resolveBranchForActor(actor: RequestUser, branchId?: string) {
    if (actor.role === 'Staff') {
      const me = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { branch: { select: { id: true, deletedAt: true } } },
      });
      if (!me?.branch) {
        throw new BadRequestException('Your account is not assigned to a branch.');
      }
      // An archived (closed) branch cannot transact.
      if (me.branch.deletedAt) {
        throw new BadRequestException(
          'Your assigned shop is archived. Ask an admin to assign you to an active shop.',
        );
      }
      return me.branch.id;
    }
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branchId;
  }

  private includeFull() {
    return {
      branch: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
    } satisfies Prisma.DisposalInclude;
  }

  private serialize(d: any) {
    return {
      id: d.id,
      branch: d.branch ? { id: d.branch.id, name: d.branch.name } : null,
      productId: d.productId,
      name: d.productName,
      brandName: d.brandName,
      quantity: d.quantity,
      unitPrice: Number(d.unitPrice),
      value: Number(d.value),
      reason: d.reason,
      status: d.status,
      createdBy: d.createdBy
        ? `${d.createdBy.firstName} ${d.createdBy.lastName}`.trim()
        : 'System',
      decidedBy: d.decidedBy
        ? `${d.decidedBy.firstName} ${d.decidedBy.lastName}`.trim()
        : null,
      decidedAt: d.decidedAt,
      createdAt: d.createdAt,
    };
  }
}
