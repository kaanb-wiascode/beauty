import { CrmLeadScoringService } from './crm-lead-scoring.service';

describe('CrmLeadScoringService', () => {
  const context = {
    tenantId: 'tenant-1',
    companyId: 'company-1',
    branchId: 'branch-1',
  };

  function makeService() {
    const query = jest.fn();
    const execute = jest.fn().mockResolvedValue(1);
    const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
    const prisma = {
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const tenantContext = { getContext: jest.fn(() => context) };
    const service = new CrmLeadScoringService(prisma as never, tenantContext as never);
    return { service, query, execute, prisma };
  }

  it('returns documented default thresholds when the tenant has no override', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([]);

    await expect(service.getPolicy()).resolves.toEqual({
      warmMin: 50,
      hotMin: 80,
      version: 0,
      updatedAt: null,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('crm_lead_scoring_policies'), 'tenant-1');
  });

  it('reads score history only inside tenant/company/branch scope', async () => {
    const { service, query } = makeService();
    query
      .mockResolvedValueOnce([{ id: 'lead-1', score: 80, temperature: 'HOT' }])
      .mockResolvedValueOnce([{ id: 'history-1', score: 80, temperature: 'HOT' }]);

    await expect(service.listHistory('lead-1', 25)).resolves.toHaveLength(1);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('tenant_id=$2::text AND company_id=$3::text'),
      'lead-1',
      'tenant-1',
      'company-1',
      'branch-1',
      25,
    );
  });

  it('persists an optimistic manual override and emits an auditable CRM event', async () => {
    const { service, query, execute } = makeService();
    query.mockResolvedValueOnce([
      {
        id: 'lead-1',
        score: 92,
        temperature: 'HOT',
        scoreVersion: 4,
        overridden: true,
      },
    ]);

    await expect(
      service.overrideScore(
        'lead-1',
        { score: 92, temperature: 'HOT', reason: 'Manager review', version: 3 },
        'actor-1',
      ),
    ).resolves.toMatchObject({ score: 92, temperature: 'HOT', scoreVersion: 4, overridden: true });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('lead_score_overridden=TRUE'),
      'lead-1',
      'tenant-1',
      'company-1',
      'branch-1',
      92,
      'HOT',
      'Manager review',
      3,
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("'LEAD_SCORE_OVERRIDDEN'"),
      'tenant-1',
      'company-1',
      'branch-1',
      'lead-1',
      'actor-1',
      expect.stringContaining('Manager review'),
    );
  });

  it('recalculates through the database scoring trigger and clears manual override', async () => {
    const { service, query, execute } = makeService();
    query.mockResolvedValueOnce([
      { id: 'lead-1', score: 67, temperature: 'WARM', scoreVersion: 5, overridden: false },
    ]);

    await expect(service.recalculate('lead-1', 'actor-1')).resolves.toMatchObject({
      score: 67,
      temperature: 'WARM',
      overridden: false,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('lead_score_overridden=FALSE'),
      'lead-1',
      'tenant-1',
      'company-1',
      'branch-1',
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("'LEAD_SCORE_RECALCULATED'"),
      'tenant-1',
      'company-1',
      'branch-1',
      'lead-1',
      'actor-1',
      expect.any(String),
    );
  });
});
