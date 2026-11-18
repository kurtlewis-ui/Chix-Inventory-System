import { SalesService } from './sales.service';
const pgModule = process.env.PGLITE_TEST_MODULE;
const describePostgres = pgModule ? describe : describe.skip;
const actor = { userId: 'owner', email: 'owner@example.invalid', role: 'Owner', sessionId: 'session' };

describePostgres('Records product-filtered payment totals in PostgreSQL', () => {
  let db: any;
  let service: SalesService;
  beforeAll(async () => {
    const { PGlite } = require(pgModule!);
    db = new PGlite();
    await db.exec(`CREATE TYPE sale_status AS ENUM ('APPROVED', 'PENDING');
      CREATE TABLE sales (id int PRIMARY KEY, branch_id uuid, status sale_status, created_at timestamp);
      CREATE TABLE sale_items (sale_id int, name text, brand_name text, unit_price numeric, quantity int, discount numeric, sub_total numeric, payment_method text, payment_split jsonb);
      INSERT INTO sales VALUES (1, '11111111-1111-1111-1111-111111111111', 'APPROVED', '2026-11-18 08:00:00');
      INSERT INTO sale_items VALUES
        (1, 'V2 100%_Pod', 'Brand', 100, 2, 10, 190, 'Split', '{"cash":100,"gcash":90}'),
        (1, 'Other Product', 'Brand', 500, 1, 0, 500, 'BankTransfer', null);`);
    service = new SalesService({
      sale: { count: async () => 1, findMany: async () => [] },
      $queryRaw: async (sql: any) => (await db.query(sql.text, sql.values.map((v: any) => v instanceof Date ? v.toISOString() : v))).rows,
    } as any);
  }, 60000);
  afterAll(async () => { if (db) await db.close(); });
  it('summarizes only matching item rows, including discounts and split payments', async () => {
    const result = await service.findRecords({ search: '100%_Pod', startDate: '2026-11-18', endDate: '2026-11-18' }, actor);
    expect(result.summary).toMatchObject({ grossSales: 200, discount: 10, cash: 100, gcash: 90, bankTransfer: 0, total: 190 });
    const all = await service.findRecords({}, actor);
    expect(all.summary).toMatchObject({ grossSales: 700, discount: 10, bankTransfer: 500, total: 690 });
    const empty = await service.findRecords({ search: '100ZZZPod' }, actor);
    expect(empty.summary.total).toBe(0);
  });
});
