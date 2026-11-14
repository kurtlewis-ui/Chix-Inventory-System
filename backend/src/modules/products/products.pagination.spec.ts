import { ProductsService } from './products.service';

describe('ProductsService pagination', () => {
  it('uses a unique tie-breaker when paging equally ordered products', async () => {
    const prisma = { product: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) } };
    const service = new ProductsService(prisma as any, {} as any);
    await service.findAll({ page: 2, limit: 200 } as any, 'Staff');
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 200, take: 200,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }));
  });
});
