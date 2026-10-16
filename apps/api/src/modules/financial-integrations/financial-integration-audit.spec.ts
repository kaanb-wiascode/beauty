import { FinancialIntegrationAuditService } from './financial-integration-audit.service';

describe('FinancialIntegrationAuditService', () => {
  it('scopes audit reads to tenant, company and branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const tenant = {
      getContext: jest.fn().mockReturnValue({
        tenantId: 'tenant-a',
        companyId: 'company-a',
        branchId: 'branch-a',
      }),
    } as never;
    const service = new FinancialIntegrationAuditService(prisma, tenant);

    await service.list({ entityId: '11111111-1111-4111-8111-111111111111', outcome: 'FAILED', limit: 25 });

    expect(String(query.mock.calls[0][0])).toContain('tenant_id=$1::text');
    expect(String(query.mock.calls[0][0])).toContain('company_id=$2::text');
    expect(String(query.mock.calls[0][0])).toContain('branch_id=$3::text');
    expect(query.mock.calls[0].slice(1)).toEqual([
      'tenant-a',
      'company-a',
      'branch-a',
      '11111111-1111-4111-8111-111111111111',
      null,
      'FAILED',
      25,
    ]);
  });

  it('caps requested audit history at 200 rows', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRawUnsafe: query } as never;
    const tenant = {
      getContext: jest.fn().mockReturnValue({ tenantId: 't', companyId: 'c', branchId: null }),
    } as never;
    const service = new FinancialIntegrationAuditService(prisma, tenant);

    await service.list({ limit: 500 });

    expect(query.mock.calls[0][7]).toBe(200);
  });
});
