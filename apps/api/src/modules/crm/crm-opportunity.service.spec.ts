import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CrmOpportunityService } from './crm-opportunity.service';

describe('CrmOpportunityService', () => {
  function tenant(branchId: string | null = 'branch-a') {
    return {
      getContext: jest.fn().mockReturnValue({
        tenantId: 'tenant-a',
        companyId: 'company-a',
        branchId,
        roleScope: branchId ? 'BRANCH' : 'CENTRAL',
      }),
    } as never;
  }

  it('requires an active branch', async () => {
    const service = new CrmOpportunityService({} as never, tenant(null));
    await expect(service.createFromCustomer({ customerId: '11111111-1111-4111-8111-111111111111', title: 'Premium paket', currency: 'TRY', probability: 25 }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects customers outside the active tenant and branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: jest.fn() };
    const transaction = jest.fn(async (callback) => callback(tx));
    const service = new CrmOpportunityService({ $transaction: transaction } as never, tenant());
    await expect(service.createFromCustomer({ customerId: '11111111-1111-4111-8111-111111111111', title: 'Premium paket', currency: 'TRY', probability: 25 }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(String(query.mock.calls[0][0])).toContain('"tenantId"=$2::text');
    expect(String(query.mock.calls[0][0])).toContain('"branchId"=$3::text');
  });

  it('creates a customer-backed opportunity and append-only CRM event', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'customer-1' }]).mockResolvedValueOnce([{ id: 'opportunity-1', customerId: 'customer-1', ownerUserId: 'user-1', title: 'Premium paket', stage: 'QUALIFIED', estimatedValue: '12500.00', currency: 'TRY', probability: 25, expectedCloseDate: null, version: 1 }]);
    const execute = jest.fn().mockResolvedValue(1);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const transaction = jest.fn(async (callback) => callback(tx));
    const service = new CrmOpportunityService({ $transaction: transaction } as never, tenant());
    await expect(service.createFromCustomer({ customerId: 'customer-1', title: 'Premium paket', estimatedValue: 12500, currency: 'TRY', probability: 25 }, 'user-1')).resolves.toMatchObject({ id: 'opportunity-1', customerId: 'customer-1', stage: 'QUALIFIED' });
    expect(String(query.mock.calls[1][0])).toContain('INSERT INTO crm_opportunities');
    expect(String(execute.mock.calls[0][0])).toContain('OPPORTUNITY_CREATED');
  });

  it('validates an explicitly assigned owner against company and branch access', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmOpportunityService({ $queryRawUnsafe: query } as never, tenant());
    await expect(service.createFromCustomer({ customerId: 'customer-1', title: 'Premium paket', currency: 'TRY', probability: 25, ownerUserId: 'user-outside-branch' }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(String(query.mock.calls[0][0])).toContain('membership_branch_access');
  });

  it('lists opportunities with scoped owner, search and stale filters', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'opportunity-1', customerId: 'customer-1', customerFirstName: 'Ada', customerLastName: 'Yılmaz' }]);
    const service = new CrmOpportunityService({ $queryRawUnsafe: query } as never, tenant());
    const updatedBefore = new Date('2026-09-01T00:00:00.000Z');
    await expect(service.list({ ownerUserId: 'user-1', search: 'Ada', updatedBefore, limit: 25 })).resolves.toEqual([expect.objectContaining({ id: 'opportunity-1', customerFirstName: 'Ada' })]);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('LEFT JOIN customers c');
    expect(sql).toContain('o.tenant_id=$1::text AND o.company_id=$2::text');
    expect(sql).toContain('ILIKE $6::text');
    expect(sql).toContain('o.updated_at < $7::timestamptz');
    expect(query.mock.calls[0].slice(1)).toEqual(['tenant-a', 'company-a', 'branch-a', null, 'user-1', '%Ada%', updatedBefore, 25]);
  });

  it('returns a branch-scoped opportunity with follow-ups and event timeline', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'opportunity-1', leadId: null, customerId: 'customer-1', ownerUserId: 'user-1', title: 'Premium paket', stage: 'PROPOSAL', estimatedValue: '12500.00', currency: 'TRY', probability: 60, expectedCloseDate: null, lostReason: null, saleId: null, commercialSnapshot: null, convertedAt: null, version: 3, createdAt: new Date('2026-09-13T10:00:00.000Z'), updatedAt: new Date('2026-09-13T12:00:00.000Z'), leadFirstName: null, leadLastName: null, customerFirstName: 'Ada', customerLastName: 'Yılmaz' }]).mockResolvedValueOnce([{ id: 'follow-up-1', opportunityId: 'opportunity-1', status: 'OPEN' }]).mockResolvedValueOnce([{ id: 'event-1', eventType: 'OPPORTUNITY_CREATED' }]);
    const service = new CrmOpportunityService({ $queryRawUnsafe: query } as never, tenant());
    await expect(service.getDetail('opportunity-1')).resolves.toMatchObject({ id: 'opportunity-1', customerId: 'customer-1', customerFirstName: 'Ada', followUps: [{ id: 'follow-up-1' }], events: [{ id: 'event-1' }] });
    expect(String(query.mock.calls[0][0])).toContain('o.tenant_id=$2::text AND o.company_id=$3::text');
    expect(String(query.mock.calls[1][0])).toContain('WHERE opportunity_id=$1::text');
  });

  it('does not expose an opportunity outside the active scope', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmOpportunityService({ $queryRawUnsafe: query } as never, tenant());
    await expect(service.getDetail('opportunity-outside')).rejects.toBeInstanceOf(NotFoundException);
  });
});
