import { CrmLeadService } from './crm-lead.service';

describe('CrmLeadService routing integration', () => {
  const context = {
    tenantId: 'tenant-1',
    companyId: 'company-1',
    branchId: 'branch-1',
  };

  const baseInput = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    source: 'MANUAL',
    budgetCurrency: 'TRY',
    leadScore: 0,
    leadTemperature: 'COLD' as const,
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
    const routing = { routeNewLead: jest.fn() };
    const service = new CrmLeadService(prisma as never, tenantContext as never, routing as never);
    return { service, query, execute, routing };
  }

  it('preserves an explicitly selected owner and bypasses automatic routing', async () => {
    const { service, query, routing } = makeService();
    query
      .mockResolvedValueOnce([{ id: 'owner-1' }])
      .mockResolvedValueOnce([{ id: 'lead-1', ownerUserId: 'owner-1', version: 1 }]);

    await expect(
      service.create({ ...baseInput, ownerUserId: 'owner-1' }, 'actor-1'),
    ).resolves.toMatchObject({ id: 'lead-1', ownerUserId: 'owner-1' });

    expect(routing.routeNewLead).not.toHaveBeenCalled();
    expect(query.mock.calls[1]?.[0]).toEqual(expect.stringContaining('INSERT INTO crm_leads'));
    expect(query.mock.calls[1]?.[5]).toBe('owner-1');
  });

  it('falls back to the creating actor when no routing rule matches', async () => {
    const { service, query, execute, routing } = makeService();
    query.mockResolvedValueOnce([{ id: 'lead-1', ownerUserId: null, version: 1 }]);
    routing.routeNewLead.mockResolvedValueOnce(null);

    await expect(service.create(baseInput, 'actor-1')).resolves.toMatchObject({
      id: 'lead-1',
      ownerUserId: 'actor-1',
    });

    expect(routing.routeNewLead).toHaveBeenCalledWith(expect.anything(), 'lead-1', 'actor-1');
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE crm_leads SET owner_user_id=$5::text'),
      'lead-1',
      'tenant-1',
      'company-1',
      'branch-1',
      'actor-1',
    );
  });

  it('returns the owner and team selected by the routing engine', async () => {
    const { service, query, execute, routing } = makeService();
    query.mockResolvedValueOnce([{ id: 'lead-1', ownerUserId: null, team: null, version: 1 }]);
    routing.routeNewLead.mockResolvedValueOnce({
      ruleId: 'rule-1',
      ruleName: 'Hot inbound',
      strategy: 'ROUND_ROBIN',
      ownerUserId: 'owner-2',
      team: 'Inbound Sales',
    });

    await expect(service.create(baseInput, 'actor-1')).resolves.toMatchObject({
      id: 'lead-1',
      ownerUserId: 'owner-2',
      team: 'Inbound Sales',
    });

    expect(execute.mock.calls.some(([sql]) => String(sql).includes('UPDATE crm_leads SET owner_user_id=$5::text'))).toBe(false);
  });
});
