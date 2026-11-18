import { disposalProductOptions, exactDisposalWhere } from './record-products';
const pgModule = process.env.PGLITE_TEST_MODULE;
const describePostgres = pgModule ? describe : describe.skip;
const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const branch = '11111111-1111-1111-1111-111111111111';

describePostgres('Disposal historical choices in PostgreSQL', () => {
  let db: any, prisma: any;
  beforeAll(async () => {
    const { PGlite } = require(pgModule!); db = new PGlite();
    prisma = { $queryRaw: async (sql: any) => (await db.query(sql.text, sql.values.map((v: any) => v instanceof Date ? v.toISOString() : v))).rows };
    await db.exec(`CREATE TABLE disposals (id serial, product_id uuid, product_name text, brand_name text, status text, branch_id uuid, reason text, created_at timestamp);
      INSERT INTO disposals(product_id,product_name,brand_name,status,branch_id,reason,created_at) VALUES
      ('${key}', 'Old V2', 'Brand', 'APPROVED','${branch}','Damaged — leaking','2026-11-17 16:00:00'),
      ('${key}', 'V2 Transparent', 'Brand', 'APPROVED','${branch}','Damaged — cracked','2026-11-18 08:00:00'),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'V2 Transparent Plus', 'Brand', 'APPROVED','${branch}','Expired','2026-11-18 08:00:00'),
      (null, 'Retired Product', 'Old Brand', 'APPROVED','${branch}',null,'2026-11-18 08:00:00'),
      (null, 'Pending Product', 'Brand', 'PENDING','${branch}','Damaged','2026-11-18 08:00:00');`);
  }, 60000);
  afterAll(async () => { if (db) await db.close(); });
  it('separates stable identities, includes deleted history and paginates all choices', async () => {
    const first = await disposalProductOptions(prisma, { limit: 1 });
    expect(first.pagination).toMatchObject({ total: 3, totalPages: 3, hasNext: true });
    const next = await disposalProductOptions(prisma, { limit: 1, page: 2 });
    expect(next.data[0].key).not.toBe(first.data[0].key);
    const matching = await disposalProductOptions(prisma, { search: 'V2' });
    expect(matching.data).toHaveLength(2);
    expect(matching.data.find(p => p.key === key)?.name).toBe('V2 Transparent');
    const historical = await disposalProductOptions(prisma, { search: 'Retired' });
    expect(exactDisposalWhere(historical.data[0].key)).toEqual({ productId: null, productName: 'Retired Product', brandName: 'Old Brand' });
  });
  it('applies approval, branch, reason, date and literal search filters', async () => {
    const damaged = await disposalProductOptions(prisma, { reason: 'Damaged', startDate: '2026-11-18', endDate: '2026-11-18' });
    expect(damaged.data.map(p => p.key)).toEqual([key]);
    expect((await disposalProductOptions(prisma, { branchId: '22222222-2222-2222-2222-222222222222' })).data).toEqual([]);
    expect((await disposalProductOptions(prisma, { startDate: '2026-11-19' })).data).toEqual([]);
    expect((await disposalProductOptions(prisma, { search: '%' })).data).toEqual([]);
    expect((await disposalProductOptions(prisma, { search: "'; DROP TABLE disposals; --" })).data).toEqual([]);
    expect((await disposalProductOptions(prisma, { search: 'Pending Product' })).data).toEqual([]);
  });
});
