import { QualitySlaService } from './quality-sla.service';

describe('QualitySlaService', () => {
  const tenant = {
    getContext: () => ({ tenantId: 'tenant-1', companyId: 'company-1', branchId: null }),
  } as any;

  it('creates a versioned SLA policy', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ version: 3 }])
        .mockResolvedValueOnce([{ id: 'policy-1', name: 'Critical', version: 3 }]),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    } as any;
    const service = new QualitySlaService(prisma, tenant);

    const result = await service.createPolicy(
      {
        name: 'Critical',
        severity: 'CRITICAL',
        dueMinutes: 60,
        escalation2Minutes: 30,
        escalation3Minutes: 120,
      },
      'user-1',
    );

    expect(result).toMatchObject({ id: 'policy-1', version: 3 });
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('applies policies with row locking and specificity ordering', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ caseId: 'case-1' }]),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    } as any;
    const service = new QualitySlaService(prisma, tenant);

    const result = await service.applyPolicies('user-1', 25);
    const sql = String(tx.$queryRawUnsafe.mock.calls[0]?.[0] ?? '');

    expect(result.processed).toBe(1);
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('SLA_POLICY_APPLIED');
    expect(sql).toContain('p.category IS NOT NULL');
  });

  it('advances SLA escalation level without duplicating lower levels', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'case-1', slaEscalationLevel: 3 }]),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    } as any;
    const service = new QualitySlaService(prisma, tenant);

    const result = await service.processOverdue('user-1', 10);
    const sql = String(tx.$queryRawUnsafe.mock.calls[0]?.[0] ?? '');

    expect(result.processed).toBe(1);
    expect(sql).toContain('GREATEST(q.sla_escalation_level,c.target_level)');
    expect(sql).toContain("'SLA_ESCALATED'");
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });
});
