import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ExpenseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpenseDto } from './dto/query-expense.dto';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import { businessDayRange } from '../../common/utils/business-day.util';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  /** Log an expense. Starts PENDING, awaiting Admin approval (no stock impact). */
  async create(dto: CreateExpenseDto, actor: RequestUser) {
    const branchId = await this.resolveBranchForActor(actor, dto.branchId);

    const expense = await this.prisma.expense.create({
      data: {
        branchId,
        staffId: actor.userId,
        amount: new Prisma.Decimal(dto.amount),
        note: dto.note.trim(),
        status: ExpenseStatus.PENDING,
      },
      include: this.includeFull(),
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: 'EXPENSE_REQUESTED',
        entityType: 'Expense',
        entityId: expense.id,
        newValues: { amount: dto.amount, note: expense.note },
      },
    });

    return this.serialize(expense);
  }

  async approve(id: string, actor: RequestUser) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException(`Expense is already ${expense.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.expense.updateMany({
        where: { id, status: ExpenseStatus.PENDING },
        data: {
          status: ExpenseStatus.APPROVED,
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Expense is already approved or declined');
      }

      const updated = await tx.expense.findUnique({ where: { id }, include: this.includeFull() });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'EXPENSE_APPROVED',
          entityType: 'Expense',
          entityId: id,
          newValues: { amount: Number(expense.amount), note: expense.note },
        },
      });

      return this.serialize(updated!);
    });
  }

  async decline(id: string, actor: RequestUser) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException(`Expense is already ${expense.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.expense.updateMany({
        where: { id, status: ExpenseStatus.PENDING },
        data: {
          status: ExpenseStatus.DECLINED,
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Expense is already approved or declined');
      }

      const updated = await tx.expense.findUnique({ where: { id }, include: this.includeFull() });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'EXPENSE_DECLINED',
          entityType: 'Expense',
          entityId: id,
          newValues: { note: expense.note },
        },
      });

      return this.serialize(updated!);
    });
  }

  async findAll(query: QueryExpenseDto, actor: RequestUser, status?: ExpenseStatus) {
    const { page = 1, limit = 50, search, branchId, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = {};
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
      // PH business-day window (2 AM–2 AM) so expenses show on the correct
      // day's report regardless of server timezone. See business-day.util.
      where.createdAt = businessDayRange(startDate, endDate);
    }

    if (search) {
      where.note = { contains: search, mode: 'insensitive' };
    }

    const [total, expenses, agg] = await Promise.all([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        include: this.includeFull(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      data: expenses.map((e) => this.serialize(e)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
      summary: {
        totalAmount: Number(agg._sum.amount ?? 0),
        count: total,
      },
    };
  }

  private async resolveBranchForActor(actor: RequestUser, branchId?: string) {
    if (actor.role === 'Staff') {
      const me = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { branchId: true },
      });
      if (!me?.branchId) {
        throw new BadRequestException('Your account is not assigned to a branch.');
      }
      return me.branchId;
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
      staff: { select: { id: true, firstName: true, lastName: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
    } satisfies Prisma.ExpenseInclude;
  }

  private serialize(e: any) {
    return {
      id: e.id,
      branch: e.branch ? { id: e.branch.id, name: e.branch.name } : null,
      staff: e.staff ? { id: e.staff.id, name: `${e.staff.firstName} ${e.staff.lastName}`.trim() } : null,
      amount: Number(e.amount),
      note: e.note,
      status: e.status,
      decidedBy: e.decidedBy ? `${e.decidedBy.firstName} ${e.decidedBy.lastName}`.trim() : null,
      decidedAt: e.decidedAt,
      createdAt: e.createdAt,
    };
  }
}
