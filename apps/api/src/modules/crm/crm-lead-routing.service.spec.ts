import { BadRequestException } from '@nestjs/common';
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
    campaignId: 'campaign-1',
    preferredContactChannel: 'WHATSAPP',
    purchaseUrgency: 'IMMEDIATE',
    leadScore: 92,
    leadTemperature: 'HOT',
    interestedServiceIds: ['service-1'],
    interestedPackageIds: [],
  };

  const targets = [
    { id: 'target-1', userId: 'user-1', position: 0, activeConversationCount: 8n, openLeadCount: 1n },
    { id: 'target-2', userId: 'user-2', position: 1, activeConversationCount: 2n, openLeadCount: 4n },
    { id: 'target-3', userId: 'user-3', position: 2, activeConversationCount: 2n, openLeadCount: 1n },
  ];

  function matchingRule(strategy: 'DIRECT_OWNER' | 'ROUND_ROBIN' | 'LEAST_OPEN_LEADS' | 'LEAST_ACTIVE' | 'FALLBACK_QUEUE', id = 'rule-1') {
    return {
      id,
      name: 'Hot inbound',
      priority: 10,
      strategy,
      conditions: { temperatures: ['HOT'], minScore: 80, campaignIds: ['campaign-1'] },
      team: 'Inbound Sales',
      version: 1,
    };
  }

  it('returns null when no enabled rule matches the lead', async () => {
    const { service, query, tx } = makeService();
    query
      .mockResolvedValueOnce([hotLead])
      .mockResolvedValueOnce([
        { ...matchingRule('ROUND_ROBIN'), conditions: { temperatures: ['COLD'] } },
      ]);

    await expect(service.routeNewLead(tx as never, 'lead-1', 'actor-1')).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('uses the configured target for direct-owner routing', async () => {
    const { service, query, execute, tx } = makeService();
    query
      .mockResolvedValueOnce([hotLead])
      .mockResolvedValueOnce([matchingRule('DIRECT_OWNER')])
      .mockResolvedValueOnce([{ id: 'rule-1' }])
      .mockResolvedValueOnce([targets[1]])
      .mockResolvedValueOnce([{ ownerUserId: 'user-2', team: 'Inbound Sales' }]);

    await expect(service.routeNewLead(tx as never, 'lead-1', 'actor-1')).resolves.toMatchObject({
      strategy: 'DIRECT_OWNER',
      ownerUserId: 'user-2',
    });
    expect(execute.mock.calls.some(([sql]) => String(sql).includes('next_index=next_index+1'))).toBe(false);
  });

  it('uses a row-locked cursor for deterministic concurrency-safe round robin', async () => {
    const { service, query, execute, tx } = makeService();
    query
      .mockResolvedValueOnce([hotLead])
      .mockResolvedValueOnce([matchingRule('ROUND_ROBIN')])
      .mockResolvedValueOnce([{ id: 'rule-1' }])
      .mockResolvedValueOnce(targets)
      .mockResolvedValueOnce([{ nextIndex: 1n }])
      .mockResolvedValueOnce([{ ownerUserId: 'user-2', team: 'Inbound Sales' }]);

    await expect(service.routeNewLead(tx as never, 'lead-1', 'actor-1')).resolves.toEqual({
      ruleId: 'rule-1',
      ruleName: 'Hot inbound',
      strategy: 'ROUND_ROBIN',
      ownerUserId: 'user-2',
      team: 'Inbound Sales',
    });

    expect(query).toHaveBeenNthCalledWith(5, expect.stringContaining('FOR UPDATE'), 'rule-1');
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('next_index=next_index+1'),
      'rule-1',
    );
  });

  it('selects the least open lead workload with stable position tie breaking', async () => {
    const { service, query, tx } = makeService();
    query
      .mockResolvedValueOnce([hotLead])
      .mockResolvedValueOnce([matchingRule('LEAST_OPEN_LEADS')])
      .mockResolvedValueOnce([{ id: 'rule-1' }])
      .mockResolvedValueOnce(targets)
      .mockResolvedValueOnce([{ ownerUserId: 'user-1', team: 'Inbound Sales' }]);

    await expect(service.routeNewLead(tx as never, 'lead-1', 'actor-1')).resolves.toMatchObject({
      strategy: 'LEAST_OPEN_LEADS',
      ownerUserId: 'user-1',
    });
  });

  it('selects the least active conversation workload with stable position tie breaking', async () => {
    const { service, query, execute, tx } = makeService();
    query
      .mockResolvedValueOnce([hotLead])
      .mockResolvedValueOnce([matchingRule('LEAST_ACTIVE')])
      .mockResolvedValueOnce([{ id: 'rule-1' }])
      .mockResolvedValueOnce(targets)
      .mockResolvedValueOnce([{ ownerUserId: 'user-2', team: 'Inbound Sales' }]);

    await expect(service.routeNewLead(tx as never, 'lead-1', 'actor-1')).resolves.toMatchObject({
      strategy: 'LEAST_ACTIVE',
      ownerUserId: 'user-2',
    });
    expect(execute.mock.calls.some(([sql]) => String(sql).includes('next_index=next_index+1'))).toBe(false);
  });

  it('routes to an ownerless branch/team fallback queue and bypasses user assignment', async () => {
    const { service, query, execute, tx } = makeService();
    query
      .mockResolvedValueOnce([hotLead])
      .mockResolvedValueOnce([matchingRule('FALLBACK_QUEUE')])
      .mockResolvedValueOnce([{ id: 'rule-1' }])
      .mockResolvedValueOnce([{ team: 'Inbound Sales' }]);

    await expect(service.routeNewLead(tx as never, 'lead-1', 'actor-1')).resolves.toEqual({
      ruleId: 'rule-1',
      ruleName: 'Hot inbound',
      strategy: 'FALLBACK_QUEUE',
      ownerUserId: null,
      team: 'Inbound Sales',
    });

    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('owner_user_id=NULL'),
      'lead-1',
      'tenant-1',
      'company-1',
      'branch-1',
      'Inbound Sales',
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM crm_conversation_assignments'),
      'tenant-1',
      'company-1',
      'branch-1',
      'lead-1',
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("'LEAD_ROUTED'"),
      'tenant-1',
      'company-1',
      'branch-1',
      'lead-1',
      'actor-1',
      expect.stringContaining('"queue":true'),
    );
  });

  it('requires exactly one target for a direct-owner rule', async () => {
    const { service } = makeService();
    await expect(service.createRule({
      name: 'Direct owner',
      priority: 1,
      strategy: 'DIRECT_OWNER',
      conditions: {},
      enabled: true,
      targetUserIds: ['user-1', 'user-2'],
    }, 'actor-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows fallback queue creation without a target user and audits the rule', async () => {
    const { service, query, execute } = makeService();
    query
      .mockResolvedValueOnce([{ id: 'rule-queue', version: 1 }])
      .mockResolvedValueOnce([{
        id: 'rule-queue',
        name: 'Unassigned fallback',
        priority: 999,
        strategy: 'FALLBACK_QUEUE',
        enabled: true,
        version: 1,
        targets: [],
      }]);

    await expect(service.createRule({
      name: 'Unassigned fallback',
      priority: 999,
      strategy: 'FALLBACK_QUEUE',
      conditions: {},
      team: 'Inbound Sales',
      enabled: true,
      targetUserIds: [],
    }, 'actor-1')).resolves.toMatchObject({ id: 'rule-queue', version: 1 });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM crm_lead_routing_targets'),
      'rule-queue',
      'tenant-1',
      'company-1',
      'branch-1',
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('crm_lead_routing_rule_events'),
      'rule-queue',
      'tenant-1',
      'company-1',
      'branch-1',
      'RULE_CREATED',
      'actor-1',
      expect.any(String),
    );
  });

  it('persists rule creation with scoped targets and an append-only audit event', async () => {
    const { service, query, execute } = makeService();
    query
      .mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }])
      .mockResolvedValueOnce([{ id: 'rule-3', version: 1 }])
      .mockResolvedValueOnce([{
        id: 'rule-3',
        name: 'Branch inbound',
        priority: 100,
        strategy: 'ROUND_ROBIN',
        enabled: true,
        version: 1,
        targets: [],
      }]);

    await expect(service.createRule({
      name: 'Branch inbound',
      priority: 100,
      strategy: 'ROUND_ROBIN',
      conditions: { temperatures: ['HOT', 'WARM'] },
      enabled: true,
      targetUserIds: ['user-1', 'user-2'],
    }, 'actor-1')).resolves.toMatchObject({ id: 'rule-3', version: 1 });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('unnest($5::text[]) WITH ORDINALITY'),
      'rule-3',
      'tenant-1',
      'company-1',
      'branch-1',
      ['user-1', 'user-2'],
    );
  });
});
