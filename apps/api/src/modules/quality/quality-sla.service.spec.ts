import { QualitySlaService } from './quality-sla.service';

describe('QualitySlaService', () => {
  const prisma = { $queryRawUnsafe: jest.fn() } as any;
  const tenant = {
    getContext: () => ({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      roleScope: 'BRANCH',
    }),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes overdue cases with row locking and idempotent breach state', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'case-1',
        branchId: 'branch-1',
        status: 'OPEN',
        assignedUserId: 'user-2',
        slaEscalationLevel: 1,
      },
    ]);

    const service = new QualitySlaService(prisma, tenant);
    const result = await service.processOverdue('actor-1', 25);

    expect(result.processed).toBe(1);
    const [sql, tenantId, companyId, branchId, limit, actorUserId] =
      prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('q.sla_breached_at IS NULL');
    expect(sql).toContain("'SLA_BREACHED'");
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(tenantId).toBe('tenant-1');
    expect(companyId).toBe('company-1');
    expect(branchId).toBe('branch-1');
    expect(limit).toBe(25);
    expect(actorUserId).toBe('actor-1');
  });

  it('lists only unresolved breached cases in tenant/company/branch scope', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    const service = new QualitySlaService(prisma, tenant);
    await service.listBreaches(500);

    const [sql, tenantId, companyId, branchId, limit] =
      prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain('q.sla_breached_at IS NOT NULL');
    expect(sql).toContain("q.status NOT IN ('RESOLVED','CLOSED')");
    expect(tenantId).toBe('tenant-1');
    expect(companyId).toBe('company-1');
    expect(branchId).toBe('branch-1');
    expect(limit).toBe(200);
  });
});
