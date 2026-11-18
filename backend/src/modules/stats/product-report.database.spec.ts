// Optional PostgreSQL integration suite. Set PGLITE_TEST_MODULE to a locally
// installed @electric-sql/pglite module; no production database is used.
import { productReport } from './product-report';
import { ProductReportQueryDto } from './dto/product-report-query.dto';
const pgModule = process.env.PGLITE_TEST_MODULE;
const describePostgres = pgModule ? describe : describe.skip;
const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

describePostgres('Product reports against PostgreSQL', () => {
  let db: any;
  let prisma: any;
  const branchA = uuid(1), branchB = uuid(2), productA = uuid(100), productB = uuid(101);
  const filters = { startDate: '2026-11-01', endDate: '2026-11-15', page: 1, limit: 2 };
  beforeAll(async () => {
    const { PGlite } = require(pgModule!);
    db = new PGlite();
    prisma = { $queryRaw: async (sql: any) => (await db.query(sql.text, sql.values.map((v: unknown) => v instanceof Date ? v.toISOString() : v))).rows };
    await db.exec(`CREATE TABLE sales (id uuid PRIMARY KEY, branch_id uuid, status text, created_at timestamp);
      CREATE TABLE sale_items (id uuid PRIMARY KEY, sale_id uuid, product_id uuid, name text, brand_name text, quantity int, sub_total numeric, cost_price numeric);
      CREATE TABLE disposals (id uuid PRIMARY KEY, product_id uuid, product_name text, brand_name text, quantity int, value numeric, created_at timestamp, branch_id uuid, status text);`);
    let counter = 1;
    async function line(product: string | null, name: string, qty: number, revenue: number, cost: number, branch = branchA, date = '2026-11-05T08:00:00Z', status = 'APPROVED') {
      const id = uuid(counter++);
      await db.query('INSERT INTO sales VALUES ($1,$2,$3,$4)', [id, branch, status, date]);
      await db.query('INSERT INTO sale_items VALUES ($1,$1,$2,$3,$4,$5,$6,$7)', [id, product, name, 'Brand', qty, revenue, cost]);
    }
    await line(productA, 'Old V2 name', 10, 2950, 100);
    await line(productA, 'V2 Transparent', 5, 1500, 120, branchB, '2026-11-10T08:00:00Z');
    await line(productB, 'V2 Transparent', 1, 100, 50);
    await line(null, 'Retired Product', 3, 300, 77);
    for (let n = 1; n <= 22; n++) await line(uuid(200 + n), `Product ${n}`, n, n * 20, 5);
    await line(uuid(400), 'Start boundary', 2, 40, 5, branchA, '2026-10-31T16:00:00Z');
    await line(uuid(401), 'End boundary excluded', 2000, 40000, 5, branchA, '2026-11-15T16:00:00Z');
    await line(productA, 'V2 Transparent', 999, 99999, 999, branchA, undefined, 'PENDING');
    await line(productA, 'V2 Transparent', 999, 99999, 999, branchA, undefined, 'DECLINED');
    await db.exec(`INSERT INTO disposals SELECT md5(n::text)::uuid, '${productA}', 'V2 Transparent', 'Brand', 1, 2,
      '2026-11-05 08:00:00'::timestamp, '${branchA}', 'APPROVED' FROM generate_series(1,250) n;
      INSERT INTO disposals VALUES ('${uuid(600)}','${productA}','V2 Transparent','Brand',1000,9999,'2026-11-05 08:00:00','${branchA}','PENDING');`);
  }, 60000);
  afterAll(async () => { if (db) await db.close(); });
  const report = (kind: 'sales' | 'disposals', extra: Partial<ProductReportQueryDto> = {}) => productReport(prisma, kind, { ...filters, ...extra });
  it('aggregates old and new per-sale costs for one product without merging another ID', async () => {
    const result = await report('sales', { productKey: productA });
    expect(result.rows).toEqual([{ key: productA, name: 'V2 Transparent', brand: 'Brand', quantity: 15, revenue: 4450, capital: 1600 }]);
    expect(result.totals).toEqual({ products: 1, quantity: 15, revenue: 4450, capital: 1600 });
  });
  it('keeps all-match totals and top ten independent of table pagination', async () => {
    const first = await report('sales'), next = await report('sales', { page: 2 });
    expect(first.pagination).toMatchObject({ total: 26, totalPages: 13, hasNext: true });
    expect(first.rows).toHaveLength(2);
    expect(first.top).toHaveLength(10);
    expect(next.totals).toEqual(first.totals);
    expect(next.top).toEqual(first.top);
    expect(next.rows.map(r => r.key)).not.toEqual(first.rows.map(r => r.key));
    expect(first.totals).toEqual({ products: 26, quantity: 274, revenue: 9950, capital: 3156 });
  });
  it('returns all matching aggregates with stable totals when limit is zero', async () => {
    const first = await report('sales');
    const all = await report('sales', { limit: 0, page: 8 });
    expect(all.rows).toHaveLength(26);
    expect(all.totals).toEqual(first.totals);
    expect(all.top).toEqual(first.top);
    expect(all.pagination).toEqual({ page: 1, limit: 0, total: 26, totalPages: 1, hasNext: false, hasPrev: false });
    expect((await report('sales', { limit: 0, search: 'Retired Product' })).rows).toHaveLength(1);
    const empty = await report('sales', { limit: 0, search: 'missing product' });
    expect(empty.rows).toEqual([]);
    expect(empty.pagination.totalPages).toBe(1);
  });
  it('scopes branch and literal product search before totals', async () => {
    const result = await report('sales', { productKey: productA, branchId: branchB });
    expect(result.totals).toEqual({ products: 1, quantity: 5, revenue: 1500, capital: 600 });
    expect((await report('sales', { search: 'v2 transparent' })).totals.quantity).toBe(16);
    expect((await report('sales', { search: '%' })).totals.products).toBe(0);
    expect((await report('sales', { search: "'; DROP TABLE sales; --" })).totals.products).toBe(0);
  });
  it('keeps historical products whose catalog entry is absent', async () => {
    const result = await report('sales', { search: 'Retired Product' });
    expect(result.totals).toMatchObject({ quantity: 3, capital: 231 });
    expect(result.rows[0].key).toContain('snapshot:');
  });
  it('includes the PH start boundary and excludes the next start boundary', async () => {
    expect((await report('sales', { search: 'Start boundary' })).totals.quantity).toBe(2);
    expect((await report('sales', { search: 'End boundary' })).totals.quantity).toBe(0);
  });
  it('aggregates more than 200 approved disposal records and excludes pending', async () => {
    const result = await report('disposals');
    expect(result.totals).toEqual({ products: 1, quantity: 250, revenue: 0, capital: 500 });
    expect((await report('disposals', { branchId: branchB })).totals.products).toBe(0);
  });
});
