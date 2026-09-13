import { BadRequestException } from '@nestjs/common';
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

    await expect(
      service.createFromCustomer(
        {
          customerId: '11111111-1111-4111-8111-111111111111',
          title: 'Premium paket',
          currency: 'TRY',
          probability: 25,
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects customers outside the active tenant and branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: jest.fn() };
    const transaction = jest.fn(async (callback) => callback(tx));
    const service = new CrmOpportunityService(
      { $transaction: transaction } as never,
      tenant(),
    );

    await expect(
      service.createFromCustomer(
        {
          customerId: '11111111-1111-4111-8111-111111111111',
          title: 'Premium paket',
          currency: 'TRY',
          probability: 25,
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(String(query.mock.calls[0][0])).toContain('"tenantId"=$2::text');
    expect(String(query.mock.calls[0][0])).toContain('"branchId"=$3::text');
    expect(query.mock.calls[0].slice(1)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'tenant-a',
      'branch-a',
    ]);
  });

  it('creates a customer-backed opportunity and append-only CRM event', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'customer-1' }])
      .mockResolvedValueOnce([
        {
          id: 'opportunity-1',
          customerId: 'customer-1',
          ownerUserId: 'user-1',
          title: 'Premium paket',
          stage: 'QUALIFIED',
          estimatedValue: '12500.00',
          currency: 'TRY',
          probability: 25,
          expectedCloseDate: null,
          version: 1,
        },
      ]);
    const execute = jest.fn().mockResolvedValue(1);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const transaction = jest.fn(async (callback) => callback(tx));
    const service = new CrmOpportunityService(
      { $transaction: transaction } as never,
      tenant(),
    );

    await expect(
      service.createFromCustomer(
        {
          customerId: 'customer-1',
          title: 'Premium paket',
          estimatedValue: 12500,
          currency: 'TRY',
          probability: 25,
        },
        'user-1',
      ),
    ).resolves.toMatchObject({
      id: 'opportunity-1',
      customerId: 'customer-1',
      stage: 'QUALIFIED',
    });

    const insertSql = String(query.mock.calls[1][0]);
    expect(insertSql).toContain('INSERT INTO crm_opportunities');
    expect(insertSql).toContain('customer_id');
    expect(insertSql).not.toContain('lead_id,customer_id');
    expect(String(execute.mock.calls[0][0])).toContain('OPPORTUNITY_CREATED');
  });

  it('validates an explicitly assigned owner against company and branch access', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmOpportunityService(
      { $queryRawUnsafe: query } as never,
      tenant(),
    );

    await expect(
      service.createFromCustomer(
        {
          customerId: 'customer-1',
          title: 'Premium paket',
          currency: 'TRY',
          probability: 25,
          ownerUserId: 'user-outside-branch',
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(String(query.mock.calls[0][0])).toContain('membership_branch_access');
    expect(query.mock.calls[0].slice(1)).toEqual([
      'user-outside-branch',
      'tenant-a',
      'company-a',
      'branch-a',
    ]);
  });
});
