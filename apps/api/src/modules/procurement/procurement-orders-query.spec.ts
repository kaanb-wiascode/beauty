import { ProcurementOrdersQueryService } from './procurement-orders-query.service';

describe('ProcurementOrdersQueryService', () => {
  it('lists purchase orders only from the active warehouse branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const tenant = {
      getCompanyId: jest.fn().mockReturnValue('company-a'),
      getBranchId: jest.fn().mockReturnValue('branch-a'),
    } as never;
    const service = new ProcurementOrdersQueryService(prisma, tenant);

    await service.list();

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('JOIN inventory_warehouses w');
    expect(sql).toContain('w.branch_id=$2::text');
    expect(query.mock.calls[0].slice(1)).toEqual(['company-a', 'branch-a']);
  });
});
