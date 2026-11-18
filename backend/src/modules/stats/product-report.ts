import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { businessDayRange } from '../../common/utils/business-day.util';
import { ProductReportQueryDto } from './dto/product-report-query.dto';

export type ProductReportKind = 'sales' | 'disposals';
export interface ProductReportRow {
  key: string;
  name: string;
  brand: string;
  quantity: number;
  revenue: number;
  capital: number;
}
interface ReportResult {
  rows: ProductReportRow[];
  top: ProductReportRow[];
  totals: { products: number; quantity: number; revenue: number; capital: number };
}

/** One database snapshot for the full-match totals, top ten and current page. */
export async function productReport(prisma: PrismaService, kind: ProductReportKind, query: ProductReportQueryDto) {
  if (query.startDate && query.endDate && query.startDate > query.endDate) {
    throw new BadRequestException('From date must be on or before To date.');
  }
  const { gte, lt } = businessDayRange(query.startDate, query.endDate);
  const page = query.limit === 0 ? 1 : query.page ?? 1;
  const limit = query.limit ?? 20;
  const conditions: Prisma.Sql[] = [Prisma.sql`status = 'APPROVED'`];
  if (query.branchId) conditions.push(Prisma.sql`branch_id = ${query.branchId}::uuid`);
  if (gte) conditions.push(Prisma.sql`created_at >= ${gte}`);
  if (lt) conditions.push(Prisma.sql`created_at < ${lt}`);
  // Restrict an exact identity before grouping the full history.
  if (query.productKey) conditions.push(isUUID(query.productKey)
    ? Prisma.sql`product_id = ${query.productKey}::uuid`
    : Prisma.sql`COALESCE(product_id::text, 'snapshot:' || json_build_array(name, brand_name)::text) = ${query.productKey}`);

  // Source identifiers are fixed code, never request input. All values below
  // are bound parameters. Capital uses each historical line's cost snapshot.
  const source = kind === 'sales'
    ? Prisma.sql`SELECT i.id, i.product_id, i.name, i.brand_name, i.quantity,
        i.sub_total AS revenue, i.cost_price * i.quantity AS capital,
        s.created_at, s.branch_id, s.status AS status
        FROM sale_items i JOIN sales s ON s.id = i.sale_id`
    : Prisma.sql`SELECT id, product_id, product_name AS name, brand_name, quantity,
        0::numeric AS revenue, value AS capital, created_at, branch_id, status::text AS status
        FROM disposals`;
  const search = query.search?.trim() ?? '';
  const [result] = await prisma.$queryRaw<ReportResult[]>(Prisma.sql`
    WITH source AS (${source}),
    lines AS (
      SELECT *, COALESCE(product_id::text, 'snapshot:' || json_build_array(name, brand_name)::text) AS key
      FROM source WHERE ${Prisma.join(conditions, ' AND ')}
    ),
    grouped AS (
      SELECT key,
        (array_agg(name ORDER BY created_at DESC, id DESC))[1] AS name,
        (array_agg(brand_name ORDER BY created_at DESC, id DESC))[1] AS brand,
        SUM(quantity) AS quantity, SUM(revenue) AS revenue, SUM(capital) AS capital
      FROM lines GROUP BY key
    ),
    matched AS (
      SELECT * FROM grouped
      WHERE (${search} = '' OR strpos(lower(name), lower(${search})) > 0
        OR strpos(lower(brand), lower(${search})) > 0)
        AND (${query.productKey ?? ''} = '' OR key = ${query.productKey ?? ''})
    ),
    ranked AS (
      SELECT *, row_number() OVER (ORDER BY quantity DESC, name ASC, key ASC) AS rank FROM matched
    )
    SELECT
      COALESCE((SELECT json_agg(json_build_object('key', key, 'name', name, 'brand', brand,
        'quantity', quantity, 'revenue', revenue, 'capital', capital) ORDER BY rank)
        FROM ranked WHERE (${limit} = 0 OR (rank > ${(page - 1) * limit} AND rank <= ${page * limit}))), '[]'::json) AS rows,
      COALESCE((SELECT json_agg(json_build_object('key', key, 'name', name, 'brand', brand,
        'quantity', quantity, 'revenue', revenue, 'capital', capital) ORDER BY rank)
        FROM ranked WHERE rank <= 10), '[]'::json) AS top,
      (SELECT json_build_object('products', COUNT(*), 'quantity', COALESCE(SUM(quantity), 0),
        'revenue', COALESCE(SUM(revenue), 0), 'capital', COALESCE(SUM(capital), 0)) FROM matched) AS totals
  `);
  const totals = result.totals;
  return { ...result, pagination: { page, limit, total: totals.products,
    totalPages: limit === 0 ? 1 : Math.max(1, Math.ceil(totals.products / limit)),
    hasNext: limit !== 0 && page * limit < totals.products, hasPrev: page > 1 } };
}
