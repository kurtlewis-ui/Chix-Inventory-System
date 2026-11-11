import { StatsService } from './stats.service';
import { SaleStatus } from '@prisma/client';

describe('StatsService profit summary', () => {
  it('uses database COGS totals without downloading item costs', async () => {
    const prisma = {
      saleItem: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { subTotal: 480, discount: 20 } }),
        findMany: jest.fn(),
      },
      expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 10 } }) },
      disposal: { aggregate: jest.fn().mockResolvedValue({ _sum: { value: 5 } }) },
      $queryRaw: jest.fn().mockResolvedValue([{ capital: '170' }]),
    };
    const result = await new StatsService(prisma as any).profitSummary(
      '11111111-1111-1111-1111-111111111111', '2026-11-08', '2026-11-08',
    );
    expect(result).toEqual({
      grossSales: 500, revenue: 480, capital: 170, grossProfit: 310,
      totalDiscount: 20, expenses: 10, disposalLosses: 5, netProfit: 295,
      margin: (295 / 480) * 100,
    });
    expect(prisma.saleItem.findMany).not.toHaveBeenCalled();
    expect(prisma.saleItem.aggregate.mock.calls[0][0].where.sale.status).toBe(SaleStatus.APPROVED);
  });
});
