import { DisposalsService } from './disposals.service';
import { DisposalsController } from './disposals.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryDisposalDto } from './dto/query-disposal.dto';

const owner = { userId: 'owner', email: 'owner@example.invalid', role: 'Owner', sessionId: 'session' };
const productKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const branchId = '11111111-1111-1111-1111-111111111111';

describe('Owner disposal records', () => {
  let prisma: any;
  let service: DisposalsService;
  beforeEach(() => {
    prisma = { disposal: { count: jest.fn().mockResolvedValue(235), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { value: 70500, quantity: 705 } }) }, $queryRaw: jest.fn().mockResolvedValue([{ rows: [], total: 0 }]) };
    service = new DisposalsService(prisma);
  });
  it('paginates beyond 200 and returns whole-filter saved cost totals', async () => {
    prisma.disposal.findMany.mockResolvedValue([{ id: 'disposal', branchId, quantity: 3, unitPrice: 100, value: 300, productName: 'V2', brandName: 'Brand', product: { sellingPrice: 999 }, status: 'APPROVED' }]);
    const result = await service.findAll({ page: 24, limit: 10, productKey, branchId, reason: 'Damaged', startDate: '2026-11-18', endDate: '2026-11-18' }, owner, 'APPROVED');
    const args = prisma.disposal.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 230, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], where: { status: 'APPROVED', productId: productKey, branchId, reason: { contains: 'Damaged', mode: 'insensitive' } } });
    expect(args.where.createdAt).toEqual({ gte: new Date('2026-11-17T16:00:00Z'), lt: new Date('2026-11-18T16:00:00Z') });
    expect(prisma.disposal.aggregate.mock.calls[0][0].where).toEqual(args.where);
    expect(prisma.disposal.count.mock.calls[0][0].where).toEqual(args.where);
    expect(result.pagination).toMatchObject({ total: 235, totalPages: 24, hasNext: false });
    expect(result.summary).toEqual({ count: 235, totalQuantity: 705, totalValue: 70500 });
    expect(result.data[0].value).toBe(300);
    expect(result.data[0].sellingValue).toBe(2997);
  });
  it('matches deleted snapshots exactly and escapes literal text filters', async () => {
    await service.findAll({ productKey: 'snapshot:["Retired V2", "Brand"]', search: '100%_Pod', reason: '50%' }, owner, 'APPROVED');
    const where = prisma.disposal.count.mock.calls[0][0].where;
    expect(where).toMatchObject({ productId: null, productName: 'Retired V2', brandName: 'Brand', reason: { contains: '50\\%' } });
    expect(where.OR[0].productName.contains).toBe('100\\%\\_Pod');
  });
  it('preserves Staff ownership scoping for pending reports', async () => {
    await service.findAll({ branchId, limit: 200 }, { ...owner, role: 'Staff', userId: 'staff' }, 'PENDING');
    expect(prisma.disposal.count.mock.calls[0][0].where).toEqual({ createdById: 'staff', status: 'PENDING' });
    expect(prisma.disposal.findMany.mock.calls[0][0].take).toBe(200);
  });
  it('returns stable empty metadata and zero totals', async () => {
    prisma.disposal.count.mockResolvedValue(0);
    prisma.disposal.aggregate.mockResolvedValue({ _sum: { value: null, quantity: null } });
    const result = await service.findAll({}, owner, 'APPROVED');
    expect(result.summary).toEqual({ count: 0, totalQuantity: 0, totalValue: 0 });
    expect(result.pagination.totalPages).toBe(1);
  });
  it.each([{ productKey: 'V2 Transparent' }, { startDate: '2026-11-19', endDate: '2026-11-18' }])('rejects invalid identity/dates before queries: %j', async query => {
    await expect(service.findAll(query, owner, 'APPROVED')).rejects.toThrow();
    expect(prisma.disposal.findMany).not.toHaveBeenCalled();
  });
  it.each(['Admin', 'Staff', 'Viewer'])('protects historical choices from %s', async role => {
    await expect(service.findRecordProducts({}, { ...owner, role })).rejects.toThrow('Owner access');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('restricts the historical choice route to Owner', () => {
    expect(Reflect.getMetadata(ROLES_KEY, DisposalsController.prototype.recordProducts)).toEqual(['Owner']);
  });
  it.each([{ page: 0 }, { limit: 201 }, { reason: 'x'.repeat(301) }, { productKey: 'x'.repeat(1001) }])('validates filters: %j', async query => {
    expect((await validate(plainToInstance(QueryDisposalDto, query))).length).toBeGreaterThan(0);
  });
});
