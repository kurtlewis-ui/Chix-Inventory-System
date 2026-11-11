import { Prisma, SaleStatus } from '@prisma/client';

/** Parameterized predicate for aggregate queries; sales must be aliased as s. */
export function saleAggregatePredicate(scope: {
  status: SaleStatus;
  branchId?: string;
  dateRange?: { gte?: Date; lt?: Date };
  search?: string;
}): Prisma.Sql {
  const clauses = [Prisma.sql`s.status = ${scope.status}::sale_status`];
  if (scope.branchId) clauses.push(Prisma.sql`s.branch_id = ${scope.branchId}::uuid`);
  if (scope.dateRange?.gte) clauses.push(Prisma.sql`s.created_at >= ${scope.dateRange.gte}::timestamp`);
  if (scope.dateRange?.lt) clauses.push(Prisma.sql`s.created_at < ${scope.dateRange.lt}::timestamp`);
  if (scope.search) {
    // Preserve the existing Prisma contains/ILIKE pattern semantics.
    // The pattern is a bound value, never interpolated SQL text.
    const pattern = `%${scope.search}%`;
    clauses.push(Prisma.sql`(
      s.customer_name ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM users u WHERE u.id = s.staff_id
        AND (u.first_name ILIKE ${pattern} OR u.last_name ILIKE ${pattern}))
      OR EXISTS (SELECT 1 FROM sale_items matched WHERE matched.sale_id = s.id
        AND (matched.name ILIKE ${pattern} OR matched.brand_name ILIKE ${pattern}))
    )`);
  }
  return Prisma.join(clauses, ' AND ');
}

/** One row crosses the database connection, regardless of the number of items. */
export function paymentSummarySql(predicate: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`SELECT
    COALESCE(SUM(i.unit_price * i.quantity), 0) AS "grossSales",
    COALESCE(SUM(i.discount), 0) AS discount,
    COALESCE(SUM(CASE WHEN i.payment_method = 'Cash' THEN i.sub_total
      WHEN i.payment_method = 'Split' THEN COALESCE((i.payment_split->>'cash')::numeric, 0)
      ELSE 0 END), 0) AS cash,
    COALESCE(SUM(CASE WHEN i.payment_method = 'Gcash' THEN i.sub_total
      WHEN i.payment_method = 'Split' THEN COALESCE((i.payment_split->>'gcash')::numeric, 0)
      ELSE 0 END), 0) AS gcash,
    COALESCE(SUM(CASE WHEN i.payment_method = 'BankTransfer' THEN i.sub_total
      WHEN i.payment_method = 'Split' THEN COALESCE((i.payment_split->>'bankTransfer')::numeric, 0)
      ELSE 0 END), 0) AS "bankTransfer"
    FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE ${predicate}`;
}
