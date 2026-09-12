import { Prisma } from '@beauty-erp/database';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CrmService } from './crm.service';

describe('CrmService', () => {
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

  it('scopes lead reads by tenant, company and the active branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmService(
      { $queryRawUnsafe: query } as never,
      tenant(),
    );

    await service.listLeads({ status: 'NEW', limit: 20 });

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('l.tenant_id=$1::text');
    expect(sql).toContain('l.company_id=$2::text');
    expect(sql).toContain('l.branch_id=$3::text');
    expect(query.mock.calls[0].slice(1, 5)).toEqual([
      'tenant-a',
      'company-a',
      'branch-a',
      'NEW',
    ]);
  });

  it('lists only active assignees from the active tenant and company', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmService(
      { $queryRawUnsafe: query } as never,
      tenant(),
    );

    await service.listAssignees();

    const calls = query.mock.calls as unknown[][];
    const sql = String(calls[0][0]);
    expect(sql).toContain('m."tenantId"=$1::text');
    expect(sql).toContain('m."companyId"=$2::text');
    expect(sql).toContain("m.status='ACTIVE'");
    expect(sql).toContain("r.scope<>'BRANCH'");
    expect(sql).toContain('membership_branch_access');
    expect(calls[0].slice(1)).toEqual(['tenant-a', 'company-a', 'branch-a']);
  });

  it('requires an active branch for lead creation', async () => {
    const service = new CrmService({} as never, tenant(null));

    await expect(
      service.createLead(
        {
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          source: 'MANUAL',
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects assignees without access to the active branch', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CrmService(
      { $queryRawUnsafe: query } as never,
      tenant(),
    );

    await expect(
      service.createLead(
        {
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          source: 'MANUAL',
          ownerUserId: 'user-outside-branch',
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const calls = query.mock.calls as unknown[][];
    expect(String(calls[0][0])).toContain('membership_branch_access');
    expect(calls[0].slice(1)).toEqual([
      'user-outside-branch',
      'tenant-a',
      'company-a',
      'branch-a',
    ]);
  });

  it('qualifies a lead exactly once inside a serializable transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'lead-1',
          branchId: 'branch-a',
          customerId: null,
          ownerUserId: 'user-1',
          status: 'CONTACTED',
          version: 2,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'opportunity-1',
          title: 'Premium paket',
          stage: 'QUALIFIED',
          version: 1,
        },
      ]);
    const execute = jest.fn().mockResolvedValue(1);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const transaction = jest.fn(async (callback, options) => {
      expect(options).toEqual({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      return callback(tx);
    });
    const service = new CrmService(
      { $transaction: transaction } as never,
      tenant(),
    );

    await expect(
      service.qualifyLead(
        'lead-1',
        {
          version: 2,
          title: 'Premium paket',
          currency: 'TRY',
          probability: 25,
        },
        'user-1',
      ),
    ).resolves.toMatchObject({ id: 'opportunity-1', idempotent: false });

    expect(String(query.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(String(query.mock.calls[1][0])).toContain('crm_opportunities');
    expect(
      execute.mock.calls.some((call) =>
        String(call[0]).includes("status='QUALIFIED'"),
      ),
    ).toBe(true);
    expect(
      execute.mock.calls.some((call) =>
        String(call[0]).includes('LEAD_QUALIFIED'),
      ),
    ).toBe(true);
  });

  it('returns the existing opportunity when qualification is retried', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'lead-1',
          branchId: 'branch-a',
          customerId: null,
          ownerUserId: 'user-1',
          status: 'QUALIFIED',
          version: 3,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'opportunity-1', title: 'Paket', stage: 'QUALIFIED', version: 1 },
      ]);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: jest.fn() };
    const transaction = jest.fn(async (callback) => callback(tx));
    const service = new CrmService(
      { $transaction: transaction } as never,
      tenant(),
    );

    await expect(
      service.qualifyLead(
        'lead-1',
        { version: 3, title: 'Paket', currency: 'TRY', probability: 25 },
        'user-1',
      ),
    ).resolves.toMatchObject({ id: 'opportunity-1', idempotent: true });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('forces terminal opportunity probabilities and converts the lead when won', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        id: 'opportunity-1',
        leadId: 'lead-1',
        stage: 'WON',
        probability: 100,
        version: 4,
      },
    ]);
    const execute = jest.fn().mockResolvedValue(1);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const transaction = jest.fn(async (callback) => callback(tx));
    const service = new CrmService(
      { $transaction: transaction } as never,
      tenant(),
    );

    await service.transitionOpportunity(
      'opportunity-1',
      { version: 3, stage: 'WON' },
      'user-1',
    );

    expect(query.mock.calls[0]).toContain(100);
    expect(
      execute.mock.calls.some((call) =>
        String(call[0]).includes("status='CONVERTED'"),
      ),
    ).toBe(true);
    expect(
      execute.mock.calls.some((call) =>
        String(call[0]).includes('OPPORTUNITY_STAGE_CHANGED'),
      ),
    ).toBe(true);
  });

  it('rejects LOST transitions without a reason', async () => {
    const service = new CrmService({} as never, tenant());

    await expect(
      service.transitionOpportunity(
        'opportunity-1',
        { version: 1, stage: 'LOST' },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not complete an already closed follow-up', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: jest.fn() };
    const transaction = jest.fn(async (callback) => callback(tx));
    const service = new CrmService(
      { $transaction: transaction } as never,
      tenant(),
    );

    await expect(
      service.completeFollowUp('follow-up-1', 'Arandı', 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
