import { CrmAutomationRulesService } from './crm-automation-rules.service';

describe('CrmAutomationRulesService', () => {
  const scope = {
    tenantId: 'tenant-1',
    companyId: 'company-1',
    branchId: 'branch-1',
  };

  function makeService() {
    const query = jest.fn();
    const execute = jest.fn().mockResolvedValue(1);
    const service = new CrmAutomationRulesService({
      $queryRawUnsafe: query,
      $executeRawUnsafe: execute,
    } as never);
    return { service, query, execute };
  }

  it('returns safe defaults when no branch overrides exist', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([]);

    await expect(service.list(scope)).resolves.toEqual([
      {
        ruleKey: 'LEAD_FIRST_TOUCH',
        enabled: true,
        config: { delayHours: 24, channel: 'CALL' },
        version: 0,
        overridden: false,
      },
      {
        ruleKey: 'OPPORTUNITY_STAGE_FOLLOW_UP',
        enabled: true,
        config: { defaultDelayDays: 2, negotiationDelayDays: 1, channel: 'CALL' },
        version: 0,
        overridden: false,
      },
      {
        ruleKey: 'STALE_OPPORTUNITY_FOLLOW_UP',
        enabled: true,
        config: { staleDays: 14, delayHours: 24, channel: 'CALL' },
        version: 0,
        overridden: false,
      },
    ]);
  });

  it('merges a scoped override onto its rule defaults', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([
      {
        ruleKey: 'STALE_OPPORTUNITY_FOLLOW_UP',
        enabled: false,
        config: { staleDays: 21 },
        version: 4,
      },
    ]);

    const rules = await service.list(scope);
    expect(rules[2]).toEqual({
      ruleKey: 'STALE_OPPORTUNITY_FOLLOW_UP',
      enabled: false,
      config: { staleDays: 21, delayHours: 24, channel: 'CALL' },
      version: 4,
      overridden: true,
    });
  });

  it('upserts a versioned branch rule and emits an audit event', async () => {
    const { service, query, execute } = makeService();
    query.mockResolvedValueOnce([
      {
        enabled: true,
        config: { delayHours: 8, channel: 'WHATSAPP' },
        version: 2,
      },
    ]);

    await expect(
      service.upsert(
        scope,
        'LEAD_FIRST_TOUCH',
        { enabled: true, config: { delayHours: 8, channel: 'WHATSAPP' }, version: 1 },
        'actor-1',
      ),
    ).resolves.toMatchObject({
      ruleKey: 'LEAD_FIRST_TOUCH',
      enabled: true,
      version: 2,
      overridden: true,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT(tenant_id,company_id,branch_id,rule_key)'),
      'tenant-1',
      'company-1',
      'branch-1',
      'LEAD_FIRST_TOUCH',
      true,
      expect.stringContaining('WHATSAPP'),
      'actor-1',
      1,
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("'AUTOMATION_RULE_UPDATED'"),
      'tenant-1',
      'company-1',
      'branch-1',
      'actor-1',
      expect.stringContaining('LEAD_FIRST_TOUCH'),
    );
  });
});
