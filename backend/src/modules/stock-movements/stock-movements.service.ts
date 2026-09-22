import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryStockMovementDto } from './dto/query-stock-movement.dto';

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log a stock movement. Called internally whenever stock changes.
   */
  async log(data: {
    productId: string;
    branchId: string;
    userId?: string;
    type: string;
    quantityChange: number;
    quantityAfter: number;
    description?: string;
  }) {
    return this.prisma.stockMovement.create({ data: data as any });
  }

  /**
   * Get stock movements for a product at a branch, newest first.
   */
  async findAll(query: QueryStockMovementDto) {
    const { page = 1, limit = 50, productId, branchId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {};
    if (productId) where.productId = productId;
    if (branchId) where.branchId = branchId;

    const [total, movements] = await Promise.all([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          product: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
        // Order by the monotonic insertion counter, not created_at: rows from
        // one multi-item sale share the same created_at, so seq is what keeps
        // the running "Remaining Quantity" in correct, stable order.
        orderBy: { seq: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: movements.map((m) => ({
        id: m.id,
        productId: m.productId,
        productName: m.product.name,
        branchId: m.branchId,
        branchName: m.branch.name,
        user: m.user ? `${m.user.firstName} ${m.user.lastName} (${m.user.email})` : null,
        type: m.type,
        quantityChange: m.quantityChange,
        quantityAfter: m.quantityAfter,
        description: m.description,
        createdAt: m.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
}
