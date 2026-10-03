import { BadRequestException } from '@nestjs/common';
import { CrmOpportunityCommercialService } from './crm-opportunity-commercial.service';

const context = (branchId: string | null = 'branch-a') => ({
  getContext: jest.fn().mockReturnValue({
    tenantId: 'tenant-a',
    companyId: 'company-a',
    branchId,
    roleScope: branchId ? 'BRANCH' : 'CENTRAL',
  }),
}) as never;

describe('CrmOpportunityCommercialService', () => {
  it('requires an active branch', async () => {
    const service = new CrmOpportunityCommercialService({} as never, context(null));
    await expect(service.update('op-1', { version: 1, probability: 50 }, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses scoped version-guarded update and appends an event', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'op-1', probability: 60, version: 2 }]);
    const execute = jest.fn().mockResolvedValue(1);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const service = new CrmOpportunityCommercialService(
      { $transaction: jest.fn(async (callback) => callback(tx)) } as never,
      context(),
    );

    await service.update('op-1', { version: 1, probability: 60 }, 'user-1');

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('tenant_id=$2::text');
    expect(sql).toContain('company_id=$3::text');
    expect(sql).toContain('branch_id=$4::text');
    expect(sql).toContain('version=$5');
    expect(sql).toContain("stage NOT IN ('WON','LOST')");
    expect(String(execute.mock.calls[0][0])).toContain('OPPORTUNITY_COMMERCIAL_UPDATED');
  });
});
