import { BadRequestException, Injectable } from '@nestjs/common';
import { SaleStatus, ExpenseStatus, DisposalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import {
  startOfBusinessDay,
  phBusinessClockSql,
  businessDayRange,
} from '../../common/utils/business-day.util';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}
  async dashboard() {
    const [
      shops,
      products,
      brands,
      pendingSales,
      approvedSales,
      staff,
      admins,
      approvedTotal,
    ] = await Promise.all([
      this.prisma.branch.count({ where: { deletedAt: null } }),
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.brand.count({ where: { deletedAt: null } }),
      this.prisma.sale.count({ where: { status: SaleStatus.PENDING } }),
      this.prisma.sale.count({ where: { status: SaleStatus.APPROVED } }),
      this.prisma.user.count({
        where: { deletedAt: null, role: { name: 'Staff' } },
      }),
      this.prisma.user.count({
        where: { deletedAt: null, role: { name: 'Admin' } },
      }),
      this.prisma.sale.aggregate({
        where: { status: SaleStatus.APPROVED },
        _sum: { total: true },
      }),
    ]);

    return {
      shops,
      products,
      brands,
      pendingSales,
      approvedSales,
      staff,
      admins,
      approvedSalesTotal: Number(approvedTotal._sum.total ?? 0),
    };
  }

  /**
   * Approved-sales totals bucketed over time for the Sales Overview chart.
   */
  async salesOverview(period: string, branchId?: string) {
    // Map each period to a Postgres date_trunc unit and a lookback window.
    // `unit` is chosen from this fixed whitelist (never user input), so it's
    // safe to interpolate into the SQL below.
    //   daily   → day buckets, last 14 days
    //   weekly  → week buckets, last 84 days
    //   monthly → month buckets, last 365 days
    //   yearly  → year buckets, ALL history (no lookback)
    //   all     → month buckets, ALL history (no lookback) — a readable line
    //             across the whole sales history
    // `sinceDays = null` means no date floor (include everything).
    let unit: 'day' | 'week' | 'month' | 'year';
    let sinceDays: number | null;
    switch (period) {
      case 'monthly': unit = 'month'; sinceDays = 365; break;
      case 'weekly': unit = 'week'; sinceDays = 84; break;
      case 'yearly': unit = 'year'; sinceDays = null; break;
      case 'all': unit = 'month'; sinceDays = null; break;
      default: unit = 'day'; sinceDays = 14; break;
    }

    const params: any[] = [];
    let branchClause = '';
    if (branchId) {
      params.push(branchId);
      branchClause = ` AND branch_id = $${params.length}::uuid`;
    }

    // Only apply a lower date bound when the period has a lookback window;
    // 'yearly' and 'all' include the full history.
    const sinceClause = sinceDays !== null ? ` AND created_at >= now() - interval '${sinceDays} days'` : '';

    // Bucket on the Philippine BUSINESS clock (created_at shifted +8h to PH,
    // then -2h so the day/week/month boundary lands at 2 AM PH). Postgres
    // date_trunc('week', ...) already starts weeks on Monday, matching the
    // "week starts Monday 2 AM" rule. We truncate on the shifted clock, then
    // shift back to a real UTC instant for the returned bucket label.
    const clock = phBusinessClockSql('created_at');
    const sql =
      `SELECT (date_trunc('${unit}', ${clock}) - interval '8 hours' + interval '2 hours') AS bucket, ` +
      `COALESCE(SUM(total), 0) AS total, COUNT(*) AS count ` +
      `FROM sales WHERE status = 'APPROVED'${sinceClause}${branchClause} ` +
      `GROUP BY 1 ORDER BY 1 ASC`;

    const rows = await this.prisma.$queryRawUnsafe<
      { bucket: Date; total: any; count: any }[]
    >(sql, ...params);

    return rows.map((r) => ({
      date: r.bucket,
      total: Number(r.total),
      count: Number(r.count),
    }));
  }

  /**
   * Top selling products (by units) from approved sales.
   */
  async topProducts(branchId?: string) {
    const items = await this.prisma.saleItem.groupBy({
      by: ['name', 'brandName'],
      where: {
        sale: { status: SaleStatus.APPROVED, ...(branchId ? { branchId } : {}) },
      },
      _sum: { quantity: true, subTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    return items.map((i) => ({
      name: i.name,
      brand: i.brandName,
      quantity: i._sum.quantity ?? 0,
      revenue: Number(i._sum.subTotal ?? 0),
    }));
  }

  /**
   * Today's approved Total Sales / Total Expenses / Net for one branch.
   * Based on `decidedAt` (when each was actually approved), not `createdAt`,
   * and only counts APPROVED records — pending items could still be
   * declined, so they'd make this a moving, unreliable number.
   */
  async branchSummary(branchId: string | undefined, actor: RequestUser) {
    const resolvedBranchId = await this.resolveBranchForActor(actor, branchId);

    // "Today" follows the shop's Philippine business day: 2:00 AM PH -> 2:00 AM
    // PH the next day. So a sale at, e.g., 1:30 AM still counts toward the
    // previous day until the clock passes 2 AM.
    const start = startOfBusinessDay();

    const [salesAgg, expensesAgg, disposalsAgg, discountAgg] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { branchId: resolvedBranchId, status: SaleStatus.APPROVED, decidedAt: { gte: start } },
        _sum: { total: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          branchId: resolvedBranchId,
          status: ExpenseStatus.APPROVED,
          decidedAt: { gte: start },
        },
        _sum: { amount: true },
      }),
      // Approved disposals today = inventory value written off (a loss), so it
      // reduces Net alongside expenses.
      this.prisma.disposal.aggregate({
        where: {
          branchId: resolvedBranchId,
          status: DisposalStatus.APPROVED,
          decidedAt: { gte: start },
        },
        _sum: { value: true },
      }),
      // Total Discount given on today's approved sales (DISPLAY only). Summed
      // from the sale items whose parent sale is approved & decided today.
      // totalSales already uses Sale.total (= Σ subTotal, net of discount), so
      // the discount is NOT subtracted again — this is purely informational.
      this.prisma.saleItem.aggregate({
        where: {
          sale: { branchId: resolvedBranchId, status: SaleStatus.APPROVED, decidedAt: { gte: start } },
        },
        _sum: { discount: true },
      }),
    ]);

    // `totalSales` here is the NET (Σ Sale.total, already after discount).
    const totalSales = Number(salesAgg._sum.total ?? 0);
    const totalExpenses = Number(expensesAgg._sum.amount ?? 0);
    const totalDisposals = Number(disposalsAgg._sum.value ?? 0);
    const totalDiscount = Number(discountAgg._sum.discount ?? 0);
    // Gross sales = net + discount = Σ(unitPrice × qty) before any discount.
    // Derived (no extra query) so Gross − Discount = Net reconciles exactly.
    const totalGrossSales = totalSales + totalDiscount;

    return {
      branchId: resolvedBranchId,
      totalGrossSales,
      totalSales,
      totalExpenses,
      totalDisposals,
      totalDiscount,
      net: totalSales - totalExpenses - totalDisposals,
    };
  }

  /**
   * Owner-only Profit & Loss over APPROVED sales for an optional branch and
   * PH business-day date range.
   *
   * This is computed server-side over ALL matching sales (not just one page)
   * using the cost price that was SNAPSHOTTED onto each sale item at the time
   * of sale (`SaleItem.costPrice`). The dashboard previously computed this on
   * the client, but the sale serializer never exposes `costPrice` (it is
   * Owner-confidential), so the client always saw cost = 0 -> Capital ₱0 and
   * Margin 100%. Doing it here keeps the raw cost on the server (never sent to
   * the browser as a per-item value) while still giving the Owner correct
   * aggregate figures.
   *
   * Definitions:
   *   revenue        = Σ SaleItem.subTotal                 (already net of discount)
   *   grossSales     = Σ (SaleItem.unitPrice × quantity)   (before discount)
   *   totalDiscount  = Σ SaleItem.discount                 (= grossSales − revenue)
   *   capital (COGS) = Σ (SaleItem.costPrice × quantity)   (cost of goods SOLD)
   *   grossProfit    = revenue − capital
   *   expenses       = Σ Expense.amount   (APPROVED, same range/branch)
   *   disposalLosses = Σ Disposal.value   (APPROVED, same range/branch)
   *   netProfit      = grossProfit − expenses − disposalLosses
   *   margin         = revenue > 0 ? netProfit / revenue × 100 : 0
   *
   * Date filtering mirrors the Sales Records list exactly: APPROVED sales
   * filtered by `createdAt` over the PH business-day window, scoped by branch.
   */
  async profitSummary(
    branchId: string | undefined,
    startDate: string | undefined,
    endDate: string | undefined,
  ) {
    const dateRange = businessDayRange(startDate, endDate);
    const hasDateFilter = dateRange.gte !== undefined || dateRange.lt !== undefined;

    const saleWhere = {
      status: SaleStatus.APPROVED,
      ...(branchId ? { branchId } : {}),
      ...(hasDateFilter ? { createdAt: dateRange } : {}),
    } as const;

    // Sum the money-side aggregates directly in the database over ALL matching
    // rows — no pagination, no per-item cost leaving the server.
    const [itemAgg, expenseAgg, disposalAgg] = await Promise.all([
      // Aggregate sale items belonging to matching approved sales.
      this.prisma.saleItem.aggregate({
        where: { sale: saleWhere },
        _sum: { subTotal: true, discount: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          status: ExpenseStatus.APPROVED,
          ...(branchId ? { branchId } : {}),
          ...(hasDateFilter ? { createdAt: dateRange } : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.disposal.aggregate({
        where: {
          status: DisposalStatus.APPROVED,
          ...(branchId ? { branchId } : {}),
          ...(hasDateFilter ? { createdAt: dateRange } : {}),
        },
        _sum: { value: true },
      }),
    ]);

    // COGS needs costPrice × quantity, which a single _sum can't express, so
    // pull just the two numeric columns for the matching items and reduce.
    // (Only quantity + costPrice are selected — nothing identifying.)
    const costRows = await this.prisma.saleItem.findMany({
      where: { sale: saleWhere },
      select: { quantity: true, costPrice: true },
    });

    let capital = 0;
    for (const row of costRows) {
      capital += Number(row.costPrice) * row.quantity;
    }

    const revenue = Number(itemAgg._sum.subTotal ?? 0);
    const totalDiscount = Number(itemAgg._sum.discount ?? 0);
    // Gross sales before discount = net revenue + discount = Σ(unitPrice × qty).
    // Display only; profit/margin below stay based on net `revenue`.
    const grossSales = revenue + totalDiscount;
    const grossProfit = revenue - capital;
    const expenses = Number(expenseAgg._sum.amount ?? 0);
    const disposalLosses = Number(disposalAgg._sum.value ?? 0);
    const netProfit = grossProfit - expenses - disposalLosses;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      grossSales,
      revenue,
      capital,
      grossProfit,
      totalDiscount,
      expenses,
      disposalLosses,
      netProfit,
      margin,
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
    return branchId;
  }
}
