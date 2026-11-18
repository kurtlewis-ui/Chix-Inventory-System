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
    expect(result.summary).toMatchObject({ grossSales: 200, discount: 10, cash: 100, gcash: 90, bankTransfer: 0, total: 190, quantity: 2 });
    const all = await service.findRecords({}, actor);
    expect(all.summary).toMatchObject({ grossSales: 700, discount: 10, bankTransfer: 500, total: 690, quantity: 3 });
    const empty = await service.findRecords({ search: '100ZZZPod' }, actor);
    expect(empty.summary.total).toBe(0);
    expect(empty.summary.quantity).toBe(0);
  });

  it('separates exact IDs, renamed products and deleted-product snapshot identities', async () => {
    const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await db.exec(`ALTER TABLE sale_items ADD COLUMN id SERIAL;
      ALTER TABLE sale_items ADD COLUMN product_id uuid;
      UPDATE sale_items SET product_id = '${key}' WHERE name = 'V2 100%_Pod';
      INSERT INTO sale_items (sale_id, product_id, name, brand_name, unit_price, quantity, discount, sub_total, payment_method) VALUES
        (1, '${key}', 'V2 Renamed', 'Brand', 120, 3, 0, 360, 'Cash'),
        (1, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'V2 100%_Pod Plus', 'Brand', 100, 9, 0, 900, 'Cash');
      INSERT INTO sales VALUES (2, '11111111-1111-1111-1111-111111111111', 'PENDING', '2026-11-18 08:00:00');
      INSERT INTO sale_items (sale_id, product_id, name, brand_name, unit_price, quantity, discount, sub_total, payment_method) VALUES
        (2, '${key}', 'Pending Only', 'Brand', 100, 999, 0, 99900, 'Cash');`);
    const exact = await service.findRecords({ productKey: key }, actor);
    expect(exact.summary).toMatchObject({ quantity: 5, grossSales: 560, total: 550 });
    const plus = await service.findRecords({ productKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, actor);
    expect(plus.summary.quantity).toBe(9);
    const products = await service.findRecordProducts({ search: 'V2', limit: 1 }, actor);
    expect(products.pagination).toMatchObject({ total: 2, totalPages: 2, hasNext: true });
    const next = await service.findRecordProducts({ search: 'V2', limit: 1, page: 2 }, actor);
    expect(next.data[0].key).not.toBe(products.data[0].key);
    const historical = await service.findRecordProducts({ search: 'Other Product' }, actor);
    expect(historical.data[0].key).toContain('snapshot:');
    const deleted = await service.findRecords({ productKey: historical.data[0].key }, actor);
    expect(deleted.summary).toMatchObject({ quantity: 1, total: 500 });
    const noMatches = await service.findRecordProducts({ search: 'missing' }, actor);
    expect(noMatches).toMatchObject({ data: [], pagination: { total: 0, totalPages: 1 } });
    expect((await service.findRecordProducts({ search: 'Pending Only' }, actor)).data).toEqual([]);
    expect((await service.findRecordProducts({ startDate: '2026-11-19', endDate: '2026-11-19' }, actor)).data).toEqual([]);
    expect((await service.findRecords({ productKey: key, startDate: '2026-11-19', endDate: '2026-11-19' }, actor)).summary.quantity).toBe(0);
    expect((await service.findRecordProducts({ branchId: '22222222-2222-2222-2222-222222222222' }, actor)).data).toEqual([]);
  });
});
