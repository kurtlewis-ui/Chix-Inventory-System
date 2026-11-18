import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { businessDayRange } from '../../common/utils/business-day.util';
import { historicalProductIdentity } from '../../common/utils/historical-product.util';
import { QueryDisposalDto } from './dto/query-disposal.dto';

export function exactDisposalWhere(key?: string): Prisma.DisposalWhereInput | undefined {
  if (!key) return undefined;
  const identity = historicalProductIdentity(key);
  return 'id' in identity ? { productId: identity.id } : { productId: null, productName: identity.name, brandName: identity.brand };
}

/** Paginated approved historical choices, independent of the active exact product. */
export async function disposalProductOptions(prisma: PrismaService, query: QueryDisposalDto) {
  if (query.startDate && query.endDate && query.startDate > query.endDate) throw new BadRequestException('From date must be on or before To date.');
  const range = businessDayRange(query.startDate, query.endDate);
  const clauses = [Prisma.sql`d.status = 'APPROVED'`];
  if (query.branchId) clauses.push(Prisma.sql`d.branch_id = ${query.branchId}::uuid`);
  if (range.gte) clauses.push(Prisma.sql`d.created_at >= ${range.gte}::timestamp`);
  if (range.lt) clauses.push(Prisma.sql`d.created_at < ${range.lt}::timestamp`);
  if (query.reason?.trim()) clauses.push(Prisma.sql`strpos(lower(COALESCE(d.reason, '')), lower(${query.reason.trim()})) > 0`);
  const search = query.search?.trim() ?? '', page = query.page ?? 1, limit = query.limit ?? 20;
  const [result] = await prisma.$queryRaw<Array<{ rows: Array<{ key: string; name: string; brand: string }>; total: number }>>(Prisma.sql`
    WITH grouped AS (
      SELECT COALESCE(d.product_id::text, 'snapshot:' || json_build_array(d.product_name, d.brand_name)::text) AS key,
        (array_agg(d.product_name ORDER BY d.created_at DESC, d.id DESC))[1] AS name,
        (array_agg(d.brand_name ORDER BY d.created_at DESC, d.id DESC))[1] AS brand
      FROM disposals d WHERE ${Prisma.join(clauses, ' AND ')}
      GROUP BY COALESCE(d.product_id::text, 'snapshot:' || json_build_array(d.product_name, d.brand_name)::text)
    ), matched AS (
      SELECT * FROM grouped WHERE ${search} = '' OR strpos(lower(name), lower(${search})) > 0 OR strpos(lower(brand), lower(${search})) > 0
    ), ranked AS (
      SELECT *, row_number() OVER (ORDER BY name, brand, key) AS rank FROM matched
    ) SELECT COALESCE((SELECT json_agg(json_build_object('key', key, 'name', name, 'brand', brand) ORDER BY rank)
      FROM ranked WHERE rank > ${(page - 1) * limit} AND rank <= ${page * limit}), '[]'::json) AS rows,
      (SELECT COUNT(*)::int FROM matched) AS total
  `);
  return { data: result.rows, pagination: { page, limit, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / limit)), hasNext: page * limit < result.total, hasPrev: page > 1 } };
}
