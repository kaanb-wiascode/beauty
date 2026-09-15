import { ConflictException } from '@nestjs/common';
import { CrmLeadSlaService } from './crm-lead-sla.service';

describe('CrmLeadSlaService', () => {
  const scope = {
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
    const tenantContext = { getContext: jest.fn(() => scope) };
    const service = new CrmLeadSlaService(prisma as never, tenantContext as never);
    return { service, prisma, query, execute };
  }

  it('returns the documented default SLA policy when no branch override exists', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([]);

    await expect(service.getPolicy()).resolves.toEqual({
      warningMinutes: 5,
      breachMinutes: 15,
      ownerEscalationMinutes: 10,
      managerEscalationMinutes: 20,
      reassignmentEscalationMinutes: 30,
      version: 0,
      updatedAt: null,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM crm_lead_sla_policies'),
      'tenant-1',
      'company-1',
      'branch-1',
    );
  });

  it('updates an existing policy optimistically and recalculates open clock deadlines', async () => {
    const { service, prisma, query, execute } = makeService();
    query
      .mockResolvedValueOnce([{
        warningMinutes: 7,
        breachMinutes: 18,
        ownerEscalationMinutes: 12,
        managerEscalationMinutes: 24,
        reassignmentEscalationMinutes: 36,
        version: 3,
        updatedAt: new Date('2026-09-16T00:00:00Z'),
      }])
      .mockResolvedValueOnce([]);

    await expect(service.updatePolicy({
      warningMinutes: 7,
      breachMinutes: 18,
      ownerEscalationMinutes: 12,
      managerEscalationMinutes: 24,
      reassignmentEscalationMinutes: 36,
      version: 2,
    }, 'actor-1')).resolves.toMatchObject({ version: 3, breachMinutes: 18 });

    expect(query.mock.calls[0]?.[0]).toEqual(expect.stringContaining('AND version=$10'));
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('policy_version=$4'),
      'tenant-1',
      'company-1',
      'branch-1',
      3,
      7,
      18,
      12,
      24,
      36,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('rejects stale policy versions without rewriting SLA clocks', async () => {
    const { service, query, execute } = makeService();
    query.mockResolvedValueOnce([]);

    await expect(service.updatePolicy({
      warningMinutes: 5,
      breachMinutes: 15,
      ownerEscalationMinutes: 10,
      managerEscalationMinutes: 20,
      reassignmentEscalationMinutes: 30,
      version: 8,
    }, 'actor-1')).rejects.toBeInstanceOf(ConflictException);

    expect(execute).not.toHaveBeenCalled();
  });

  it('persists idempotent escalation events and advances the clock escalation level', async () => {
    const { service, query, execute } = makeService();
    query.mockResolvedValueOnce([
      { clockId: 'clock-1', eventType: 'OWNER_ESCALATED', escalationLevel: 1 },
      { clockId: 'clock-1', eventType: 'MANAGER_ESCALATED', escalationLevel: 2 },
    ]);

    await expect(service.processDueEscalations(scope)).resolves.toEqual({
      created: 2,
      events: [
        { clockId: 'clock-1', eventType: 'OWNER_ESCALATED', escalationLevel: 1 },
        { clockId: 'clock-1', eventType: 'MANAGER_ESCALATED', escalationLevel: 2 },
      ],
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT(clock_id,event_type) DO NOTHING'),
      'tenant-1',
      'company-1',
      'branch-1',
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('last_escalation_level=events.max_level'),
      'tenant-1',
      'company-1',
      'branch-1',
    );
  });

  it('returns manager dashboard sections from the active branch only', async () => {
    const { service, query } = makeService();
    query
      .mockResolvedValueOnce([{ breached: 2, slaComplianceRate: 87.5 }])
      .mockResolvedValueOnce([{ leadId: 'lead-1', breachAgeMinutes: 11 }])
      .mockResolvedValueOnce([{ ownerUserId: 'user-1', openLeads: 4 }])
      .mockResolvedValueOnce([{ id: 'event-1', eventType: 'OWNER_ESCALATED' }]);

    await expect(service.dashboard()).resolves.toEqual({
      summary: { breached: 2, slaComplianceRate: 87.5 },
      breaches: [{ leadId: 'lead-1', breachAgeMinutes: 11 }],
      owners: [{ ownerUserId: 'user-1', openLeads: 4 }],
      escalations: [{ id: 'event-1', eventType: 'OWNER_ESCALATED' }],
    });

    expect(query).toHaveBeenCalledTimes(4);
    for (const call of query.mock.calls) {
      expect(call.slice(-3)).toEqual(['tenant-1', 'company-1', 'branch-1']);
    }
  });
});
