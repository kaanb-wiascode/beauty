import { NotFoundException } from '@nestjs/common';
import { CrmCustomer360Service } from './crm-customer360.service';

describe('CrmCustomer360Service', () => {
  const tenant = {
    getContext: jest.fn().mockReturnValue({
      tenantId: 'tenant-a',
      companyId: 'company-a',
      branchId: 'branch-a',
      roleScope: 'BRANCH',
    }),
  };

  it('returns scoped CRM summary, opportunities, follow-ups and events', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'customer-1' }])
      .mockResolvedValueOnce([{ openOpportunityCount: 1, weightedPipeline: 5000 }])
      .mockResolvedValueOnce([{ id: 'opportunity-1' }])
      .mockResolvedValueOnce([{ id: 'follow-up-1' }])
      .mockResolvedValueOnce([{ id: 'event-1' }]);
    const service = new CrmCustomer360Service({ $queryRawUnsafe: query } as never, tenant as never);

    await expect(service.getSummary('customer-1')).resolves.toMatchObject({
      summary: { openOpportunityCount: 1, weightedPipeline: 5000 },
      opportunities: [{ id: 'opportunity-1' }],
      followUps: [{ id: 'follow-up-1' }],
      events: [{ id: 'event-1' }],
    });

    expect(String(query.mock.calls[0][0])).toContain('"tenantId"=$2::text');
    for (const call of query.mock.calls.slice(1)) {
      expect(String(call[0])).toContain('tenant_id=$1::text');
      expect(String(call[0])).toContain('company_id=$2::text');
      expect(call.slice(1)).toEqual(['tenant-a', 'company-a', 'branch-a', 'customer-1']);
    }
  });

  it('does not expose a customer outside active scope', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmCustomer360Service({ $queryRawUnsafe: query } as never, tenant as never);
    await expect(service.getSummary('outside')).rejects.toBeInstanceOf(NotFoundException);
  });
});
