import { CrmLeadRoutingService } from './crm-lead-routing.service';

describe('CrmLeadRoutingService', () => {
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
    const service = new CrmLeadRoutingService(prisma as never, tenantContext as never);
    return { service, query, execute, tx };
  }

  const hotLead = {
    id: 'lead-1',
    source: 'META_ADS',
    preferredContactChannel: 'WHATSAPP',
    purchaseUrgency: 'IMMEDIATE',
    leadScore: 92,
    leadTemperature: 'HOT',
    interestedServiceIds: ['service-1'],
    interestedPackageIds: [],
  };

  it('returns null when no enabled rule matches the lead', async () => {
    const { service, query, tx } = makeService();
    query
      .mockResolvedValueOnce([hotLead])
      .mockResolvedValueOnce([
        {
          id: 'rule-1',
          name: 'Cold leads',
          priority: 10,
          strategy: 'ROUND_ROBIN',
          conditions: { temperatures: ['COLD'] },
          team: null,
          version: 1,
        },
      ]);

    await expect(service.routeNewLead(tx as never, 'lead-1', 'actor-1')).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('uses a row-locked cursor for deterministic concurrency-safe round robin', async () => {
    const { service, query, execute, tx } = makeService();
    query
      .mockResolvedValueOnce([hotLead])
      .mockResolvedValueOnce([
        {
          id: 'rule-1',
          name: 'Hot inbound',
          priority: 10,
          strategy: 'ROUND_ROBIN',
          conditions: { temperatures: ['HOT'], minScore: 80 },
          team: 'Inbound Sales',
          version: 1,
        },
      ])
      .mockResolvedValueOnce([{ id: 'rule-1' }])
      .mockResolvedValueOnce([
        { id: 'target-1', userId: 'user-1', position: 0, activeCount: 2n },
        { id: 'target-2', userId: 'user-2', position: 1, activeCount: 1n },
      ])
      .mockResolvedValueOnce([{ nextIndex: 1n }])
      .mockResolvedValueOnce([{ ownerUserId: 'user-2', team: 'Inbound Sales' }]);

    await expect(service.routeNewLead(tx as never, 'lead-1', 'actor-1')).resolves.toEqual({
      ruleId: 'rule-1',
      ruleName: 'Hot inbound',
      strategy: 'ROUND_ROBIN',
      ownerUserId: 'user-2',
      team: 'Inbound Sales',
    });

    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('FOR UPDATE'),
      'rule-1',
    );
    expect(query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('UPDATE crm_leads SET owner_user_id=$5::text'),
      'lead-1',
      'tenant-1',
      'company-1',
      'branch-1',
      'user-2',
      'Inbound Sales',
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('next_index=next_index+1'),
      'rule-1',
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("'LEAD_ROUTED'"),
      'tenant-1',
      'company-1',
      'branch-1',
      'lead-1',
      'actor-1',
      expect.stringContaining('user-2'),
    );
  });

  it('selects the least-loaded active target with stable position tie breaking', async () => {
    const { service, query, execute, tx } = makeService();
    query
      .mockResolvedValueOnce([hotLead])
      .mockResolvedValueOnce([
        {
          id: 'rule-2',
          name: 'Least active',
          priority: 20,
          strategy: 'LEAST_ACTIVE',
          conditions: { sources: ['meta_ads'] },
          team: null,
          version: 1,
        },
      ])
      .mockResolvedValueOnce([{ id: 'rule-2' }])
      .mockResolvedValueOnce([
        { id: 'target-1', userId: 'user-1', position: 0, activeCount: 8n },
        { id: 'target-2', userId: 'user-2', position: 1, activeCount: 2n },
        { id: 'target-3', userId: 'user-3', position: 2, activeCount: 2n },
      ])
      .mockResolvedValueOnce([{ ownerUserId: 'user-2', team: null }]);

    await expect(service.routeNewLead(tx as never, 'lead-1', 'actor-1')).resolves.toMatchObject({
      strategy: 'LEAST_ACTIVE',
      ownerUserId: 'user-2',
    });

    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('UPDATE crm_leads SET owner_user_id=$5::text'),
      'lead-1',
      'tenant-1',
      'company-1',
      'branch-1',
      'user-2',
      null,
    );
    expect(execute.mock.calls.some(([sql]) => String(sql).includes('crm_lead_routing_cursors'))).toBe(false);
  });

  it('persists rule creation with scoped targets and an append-only audit event', async () => {
    const { service, query, execute } = makeService();
    query
      .mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }])
      .mockResolvedValueOnce([{ id: 'rule-3', version: 1 }])
      .mockResolvedValueOnce([
        {
          id: 'rule-3',
          name: 'Branch inbound',
          priority: 100,
          strategy: 'ROUND_ROBIN',
          enabled: true,
          version: 1,
          targets: [],
        },
      ]);

    await expect(
      service.createRule(
        {
          name: 'Branch inbound',
          priority: 100,
          strategy: 'ROUND_ROBIN',
          conditions: { temperatures: ['HOT', 'WARM'] },
          enabled: true,
          targetUserIds: ['user-1', 'user-2'],
        },
        'actor-1',
      ),
    ).resolves.toMatchObject({ id: 'rule-3', version: 1 });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('unnest($5::text[]) WITH ORDINALITY'),
      'rule-3',
      'tenant-1',
      'company-1',
      'branch-1',
      ['user-1', 'user-2'],
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('crm_lead_routing_rule_events'),
      'rule-3',
      'tenant-1',
      'company-1',
      'branch-1',
      'RULE_CREATED',
      'actor-1',
      expect.any(String),
    );
  });
});
