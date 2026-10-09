import { BadRequestException, Injectable } from '@nestjs/common';
import { SaleStatus, ExpenseStatus, DisposalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import {
  startOfBusinessDay,
  phBusinessClockSql,
  businessDayRange,
  PH_OFFSET_MS,
  BUSINESS_DAY_START_HOUR,
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
    // then -<startHour>h so the day/week/month boundary lands at the business
    // day start — 12 AM PH). Postgres date_trunc('week', ...) already starts
    // weeks on Monday, matching the "week starts Monday" rule. We truncate on
    // the shifted clock, then shift back to a real UTC instant for the returned
    // bucket label. Both shift amounts derive from the shared business-day
    // constants so the boundary stays consistent if it ever changes.
    const phOffsetHours = PH_OFFSET_MS / 3600000;
    const clock = phBusinessClockSql('created_at');
    const sql =
      `SELECT (date_trunc('${unit}', ${clock}) - interval '${phOffsetHours} hours' + interval '${BUSINESS_DAY_START_HOUR} hours') AS bucket, ` +
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
   * Owner-only NET PROFIT bucketed over time, for the Owner's Sales Overview
   * chart. Each period's plotted value uses the SAME formula as the Profit &
   * Loss board (profitSummary), just computed per time bucket:
   *
   *   netProfit = revenue − capital − expenses − disposalLosses
   *     revenue        = Σ SaleItem.subTotal            (net of discount)
   *     capital (COGS) = Σ (SaleItem.costPrice × qty)   (cost of goods SOLD)
   *     expenses       = Σ Expense.amount   (APPROVED)
   *     disposalLosses = Σ Disposal.value   (APPROVED)
   *
   * This reads SaleItem.costPrice, which is Owner-confidential — hence the
   * endpoint is Owner-ONLY (see stats.controller). Admin keeps salesOverview
   * (net sales, no cost). Bucketing (period → unit + lookback window) and the
   * PH business-clock truncation exactly mirror salesOverview so the two
   * series line up on the same time axis.
   */
  async profitOverview(period: string, branchId?: string) {
    // Same whitelist mapping as salesOverview — `unit` is never user input.
    let unit: 'day' | 'week' | 'month' | 'year';
    let sinceDays: number | null;
    switch (period) {
      case 'monthly': unit = 'month'; sinceDays = 365; break;
      case 'weekly': unit = 'week'; sinceDays = 84; break;
      case 'yearly': unit = 'year'; sinceDays = null; break;
      case 'all': unit = 'month'; sinceDays = null; break;
      default: unit = 'day'; sinceDays = 14; break;
    }

    // $1 (when present) is the branchId, referenced as $1::uuid in every CTE
    // via branchFor() below.
    const params: any[] = [];
    if (branchId) {
      params.push(branchId);
    }

    // Bucket every source table on the same PH business clock, then shift the
    // truncated instant back to a real UTC bucket label (identical to
    // salesOverview). Build the bucket expression per table so each references
    // the correctly-qualified created_at column (the revenue CTE joins sales,
    // so it must qualify with the `s.` alias).
    const phOffsetHours = PH_OFFSET_MS / 3600000;
    const bucketFor = (col: string) =>
      `(date_trunc('${unit}', ${phBusinessClockSql(col)}) - interval '${phOffsetHours} hours' + interval '${BUSINESS_DAY_START_HOUR} hours')`;
    // Per-table since/branch filters, with the column qualified as needed.
    const sinceFor = (col: string) =>
      sinceDays !== null ? ` AND ${col} >= now() - interval '${sinceDays} days'` : '';
    const branchFor = (col: string) =>
      branchId ? ` AND ${col} = $1::uuid` : '';

    // revenue (net) and capital (Σ cost×qty) per bucket, from approved sales'
    // items. sale_items join sales to inherit each sale's created_at/branch.
    const revenueCte =
      `rev AS (` +
      `SELECT ${bucketFor('s.created_at')} AS bucket, ` +
      `COALESCE(SUM(si.sub_total), 0) AS revenue, ` +
      `COALESCE(SUM(si.cost_price * si.quantity), 0) AS capital ` +
      `FROM sale_items si JOIN sales s ON s.id = si.sale_id ` +
      `WHERE s.status = 'APPROVED'${sinceFor('s.created_at')}${branchFor('s.branch_id')} ` +
      `GROUP BY 1)`;

    // expenses per bucket (approved).
    const expenseCte =
      `exp AS (` +
      `SELECT ${bucketFor('created_at')} AS bucket, COALESCE(SUM(amount), 0) AS expenses ` +
      `FROM expenses WHERE status = 'APPROVED'${sinceFor('created_at')}${branchFor('branch_id')} ` +
      `GROUP BY 1)`;

    // disposal losses per bucket (approved) — value is cost-based going forward.
    const disposalCte =
      `disp AS (` +
      `SELECT ${bucketFor('created_at')} AS bucket, COALESCE(SUM(value), 0) AS disposal_losses ` +
      `FROM disposals WHERE status = 'APPROVED'${sinceFor('created_at')}${branchFor('branch_id')} ` +
      `GROUP BY 1)`;

    // FULL OUTER JOIN the three per-bucket CTEs so a bucket with only an
    // expense/disposal (and no sale) still appears, then net them.
    const sql =
      `WITH ${revenueCte}, ${expenseCte}, ${disposalCte} ` +
      `SELECT b.bucket AS bucket, ` +
      `COALESCE(rev.revenue, 0) - COALESCE(rev.capital, 0) ` +
      `- COALESCE(exp.expenses, 0) - COALESCE(disp.disposal_losses, 0) AS total ` +
      `FROM (` +
      `SELECT bucket FROM rev UNION SELECT bucket FROM exp UNION SELECT bucket FROM disp` +
      `) b ` +
      `LEFT JOIN rev ON rev.bucket = b.bucket ` +
      `LEFT JOIN exp ON exp.bucket = b.bucket ` +
      `LEFT JOIN disp ON disp.bucket = b.bucket ` +
      `ORDER BY b.bucket ASC`;

    const rows = await this.prisma.$queryRawUnsafe<
      { bucket: Date; total: any }[]
    >(sql, ...params);

    return rows.map((r) => ({
      date: r.bucket,
      total: Number(r.total),
      count: 0,
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
   * Branch summary strip (Total Sales / Expenses / Discount / Net), computed
   * differently per role because the two audiences care about different things:
   *
   *   - STAFF: PENDING-based. Shows the running totals of everything the staff's
   *     branch has submitted but that has NOT yet been decided. A record stays
   *     counted until it is APPROVED or DECLINED — it does NOT reset at midnight.
   *     When every pending record is cleared, the strip reads ₱0. This mirrors
   *     the staff Daily Report, which lists PENDING records by status, not day.
   *
   *   - OWNER / ADMIN: APPROVED-TODAY. Shows what was actually approved during
   *     the current PH business day (12 AM–12 AM), based on `decidedAt`. This is
   *     the shop's realised sales/kita for today and resets at midnight.
   */
  async branchSummary(branchId: string | undefined, actor: RequestUser) {
    const resolvedBranchId = await this.resolveBranchForActor(actor, branchId);

    // Role decides the filter: staff see their pending submissions; owner/admin
    // see what has been approved so far today.
    const isStaff = actor.role === 'Staff';
    const start = startOfBusinessDay();

    // Status + (for owner/admin) decided-today filter, reused across every
    // query below so sales, expenses, disposals and the discount/payment
    // breakdowns all use the exact same scope.
    const saleWhere = isStaff
      ? { branchId: resolvedBranchId, status: SaleStatus.PENDING }
      : { branchId: resolvedBranchId, status: SaleStatus.APPROVED, decidedAt: { gte: start } };
    const expenseWhere = isStaff
      ? { branchId: resolvedBranchId, status: ExpenseStatus.PENDING }
      : { branchId: resolvedBranchId, status: ExpenseStatus.APPROVED, decidedAt: { gte: start } };
    const disposalWhere = isStaff
      ? { branchId: resolvedBranchId, status: DisposalStatus.PENDING }
      : { branchId: resolvedBranchId, status: DisposalStatus.APPROVED, decidedAt: { gte: start } };

    const [salesAgg, expensesAgg, disposalsAgg, discountAgg, paymentItems, disposalRows] = await Promise.all([
      this.prisma.sale.aggregate({
        where: saleWhere,
        _sum: { total: true },
      }),
      this.prisma.expense.aggregate({
        where: expenseWhere,
        _sum: { amount: true },
      }),
      // Disposals = inventory value written off (a loss), so it reduces Net
      // alongside expenses. (Pending for staff; approved-today for owner/admin.)
      this.prisma.disposal.aggregate({
        where: disposalWhere,
        _sum: { value: true },
      }),
      // Total Discount (DISPLAY only). Summed from the sale items whose parent
      // sale is in scope. totalSales already uses Sale.total (= Σ subTotal, net
      // of discount), so the discount is NOT subtracted again — informational.
      this.prisma.saleItem.aggregate({
        where: { sale: saleWhere },
        _sum: { discount: true },
      }),
      // Per-payment-method breakdown of the in-scope sales. Pulled at the item
      // level (payment varies per item) and split across buckets exactly like
      // the /sales list summary: a Split item contributes its split amounts,
      // everything else contributes its subTotal to its own bucket.
      this.prisma.saleItem.findMany({
        where: { sale: saleWhere },
        select: { paymentMethod: true, subTotal: true, paymentSplit: true },
      }),
      // In-scope disposal rows (productId + qty) so we can also value them at
      // the product's SELLING price — the Admin's strip shows disposals at
      // selling price, while Disposal.value stays cost-based for the Owner's
      // P&L. Uses the product's CURRENT selling price.
      this.prisma.disposal.findMany({
        where: disposalWhere,
        select: { productId: true, quantity: true },
      }),
    ]);

    // Value today's disposals at the products' CURRENT selling price for the
    // Admin Today strip (totalDisposals below stays cost-based for the Owner).
    // Look up selling prices for the disposed products in one query, then sum
    // sellingPrice × quantity. Disposals of a deleted product (productId null)
    // contribute 0 to this selling-price figure.
    const disposalProductIds = Array.from(
      new Set(disposalRows.map((d) => d.productId).filter((id): id is string => !!id)),
    );
    const disposalProducts = disposalProductIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: disposalProductIds } },
          select: { id: true, sellingPrice: true },
        })
      : [];
    const sellingPriceById = new Map(
      disposalProducts.map((p) => [p.id, Number(p.sellingPrice)]),
    );
    let totalDisposalsSelling = 0;
    for (const d of disposalRows) {
      if (d.productId && sellingPriceById.has(d.productId)) {
        totalDisposalsSelling += sellingPriceById.get(d.productId)! * d.quantity;
      }
    }

    // `totalSales` here is the NET (Σ Sale.total, already after discount).
    const totalSales = Number(salesAgg._sum.total ?? 0);
    const totalExpenses = Number(expensesAgg._sum.amount ?? 0);
    const totalDisposals = Number(disposalsAgg._sum.value ?? 0);
    const totalDiscount = Number(discountAgg._sum.discount ?? 0);
    // Gross sales = net + discount = Σ(unitPrice × qty) before any discount.
    // Derived (no extra query) so Gross − Discount = Net reconciles exactly.
    const totalGrossSales = totalSales + totalDiscount;

    // Payment-method buckets (Cash / Gcash / Bank Transfer). Split items are
    // apportioned across their three buckets.
    let cash = 0;
    let gcash = 0;
    let bankTransfer = 0;
    for (const item of paymentItems) {
      if (item.paymentMethod === 'Split' && item.paymentSplit) {
        const split = item.paymentSplit as unknown as {
          cash: number; gcash: number; bankTransfer: number;
        };
        cash += Number(split.cash || 0);
        gcash += Number(split.gcash || 0);
        bankTransfer += Number(split.bankTransfer || 0);
      } else {
        const amount = Number(item.subTotal);
        if (item.paymentMethod === 'Cash') cash += amount;
        else if (item.paymentMethod === 'Gcash') gcash += amount;
        else if (item.paymentMethod === 'BankTransfer') bankTransfer += amount;
      }
    }

    return {
      branchId: resolvedBranchId,
      totalGrossSales,
      totalSales,
      totalExpenses,
      totalDisposals,
      // Selling-price valuation of today's disposals — used by the Admin Today
      // strip only. `totalDisposals` above stays cost-based (Owner P&L).
      totalDisposalsSelling,
      totalDiscount,
      cash,
      gcash,
      bankTransfer,
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

  /**
   * Owner+Admin sales summary over APPROVED sales for an optional branch and
   * PH business-day date range. This is the COST-FREE counterpart to
   * profitSummary: it deliberately computes NO cost-derived figures (no
   * Capital/COGS, Gross Profit, Net Profit or Margin), so it is safe for the
   * Admin dashboard where cost is confidential. It never reads SaleItem.costPrice.
   *
   * Definitions (all selling-price / expense / disposal figures only):
   *   totalSales      = Σ SaleItem.subTotal              (NET, already after discount)
   *   totalDiscount   = Σ SaleItem.discount              (display only)
   *   totalGrossSales = totalSales + totalDiscount       (before discount)
   *   totalExpenses   = Σ Expense.amount   (APPROVED, same range/branch)
   *   disposalLosses  = Σ Disposal.value   (APPROVED, same range/branch)
   *   net             = totalSales − totalExpenses − disposalLosses
   *
   * Date filtering mirrors profitSummary/the Sales Records list: APPROVED sales
   * over the PH business-day window, scoped by branch (branchId omitted = all shops).
   */
  async salesSummary(
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

    const [itemAgg, expenseAgg, disposalAgg] = await Promise.all([
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

    const totalSales = Number(itemAgg._sum.subTotal ?? 0);
    const totalDiscount = Number(itemAgg._sum.discount ?? 0);
    const totalGrossSales = totalSales + totalDiscount;
    const totalExpenses = Number(expenseAgg._sum.amount ?? 0);
    const disposalLosses = Number(disposalAgg._sum.value ?? 0);
    const net = totalSales - totalExpenses - disposalLosses;

    return {
      totalGrossSales,
      totalSales,
      totalDiscount,
      totalExpenses,
      disposalLosses,
      net,
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
