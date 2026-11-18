import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductReportQueryDto } from './dto/product-report-query.dto';
import { productReport } from './product-report';
import { StatsController } from './stats.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('Owner product report boundaries', () => {
  it.each(['productSales', 'productDisposals'])('%s is restricted to Owner', method => {
    expect(Reflect.getMetadata(ROLES_KEY, (StatsController.prototype as any)[method])).toEqual(['Owner']);
  });
  it.each([{ limit: 101 }, { page: 0 }, { branchId: 'not-uuid' }, { startDate: '2026-02-30' }, { endDate: 'yesterday' }])('rejects invalid filters: %j', async query => {
    expect((await validate(plainToInstance(ProductReportQueryDto, query))).length).toBeGreaterThan(0);
  });
  it('rejects reversed dates before making a database request', async () => {
    const prisma: any = { $queryRaw: jest.fn() };
    await expect(productReport(prisma, 'sales', plainToInstance(ProductReportQueryDto, { startDate: '2026-11-15', endDate: '2026-11-01' }))).rejects.toThrow('From date');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('binds search text instead of interpolating it into SQL', async () => {
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([{ rows: [], top: [], totals: { products: 0, quantity: 0, revenue: 0, capital: 0 } }]) };
    const text = "'; DROP TABLE sales; --";
    const result = await productReport(prisma, 'sales', plainToInstance(ProductReportQueryDto, { search: text }));
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.text).not.toContain(text);
    expect(sql.values).toContain(text);
    expect(sql.text).toContain('i.cost_price * i.quantity');
    expect(sql.text).not.toContain('JOIN products');
    expect(result.pagination).toMatchObject({ total: 0, totalPages: 1, hasNext: false });
  });
});
