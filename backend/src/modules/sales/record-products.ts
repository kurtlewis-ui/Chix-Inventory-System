import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { businessDayRange } from '../../common/utils/business-day.util';
import { saleAggregatePredicate } from '../../common/utils/sale-aggregate.util';
import { QuerySaleDto } from './dto/query-sale.dto';

/** Historical identity: catalog IDs survive renames; deleted IDs use saved labels. */
function identity(key: string): { id: string } | { name: string; brand: string } {
  if (isUUID(key)) return { id: key };
  if (key.startsWith('snapshot:')) {
    try {
      const labels = JSON.parse(key.slice(9));
      if (Array.isArray(labels) && labels.length === 2 && labels.every(v => typeof v === 'string')) {
        return { name: labels[0], brand: labels[1] };
      }
    } catch { /* Reject malformed identities below. */ }
  }
  throw new BadRequestException('Choose a valid exact product.');
}

export function exactRecordItemWhere(key?: string): Prisma.SaleItemWhereInput | undefined {
  if (!key) return undefined;
  const product = identity(key);
  return 'id' in product ? { productId: product.id } : { productId: null, name: product.name, brandName: product.brand };
}

/** Sale items must be aliased as i. All values are bound parameters. */
export function exactRecordItemSql(key?: string): Prisma.Sql {
  if (!key) return Prisma.sql`TRUE`;
  const product = identity(key);
  return 'id' in product ? Prisma.sql`i.product_id = ${product.id}::uuid`
    : Prisma.sql`i.product_id IS NULL AND i.name = ${product.name} AND i.brand_name = ${product.brand}`;
}

export async function recordProductOptions(prisma: PrismaService, query: QuerySaleDto, branchId?: string) {
  if (query.startDate && query.endDate && query.startDate > query.endDate) {
    throw new BadRequestException('From date must be on or before To date.');
  }
  const page = query.page ?? 1, limit = query.limit ?? 20, search = query.search?.trim() ?? '';
  const predicate = saleAggregatePredicate({ status: 'APPROVED', branchId, dateRange: businessDayRange(query.startDate, query.endDate) });
  const [result] = await prisma.$queryRaw<Array<{ rows: Array<{ key: string; name: string; brand: string }>; total: number }>>(Prisma.sql`
    WITH grouped AS (
      SELECT COALESCE(i.product_id::text, 'snapshot:' || json_build_array(i.name, i.brand_name)::text) AS key,
        (array_agg(i.name ORDER BY s.created_at DESC, i.id DESC))[1] AS name,
        (array_agg(i.brand_name ORDER BY s.created_at DESC, i.id DESC))[1] AS brand
      FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE ${predicate}
      GROUP BY COALESCE(i.product_id::text, 'snapshot:' || json_build_array(i.name, i.brand_name)::text)
    ), matched AS (
      SELECT * FROM grouped WHERE ${search} = '' OR strpos(lower(name), lower(${search})) > 0 OR strpos(lower(brand), lower(${search})) > 0
    ), ranked AS (
      SELECT *, row_number() OVER (ORDER BY name, brand, key) AS rank FROM matched
    ) SELECT COALESCE((SELECT json_agg(json_build_object('key', key, 'name', name, 'brand', brand) ORDER BY rank)
        FROM ranked WHERE rank > ${(page - 1) * limit} AND rank <= ${page * limit}), '[]'::json) AS rows,
      (SELECT COUNT(*)::int FROM matched) AS total
  `);
  return { data: result.rows, pagination: { page, limit, total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / limit)), hasNext: page * limit < result.total, hasPrev: page > 1 } };
}
