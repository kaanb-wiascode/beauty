import { OffboardingService } from './offboarding.service';

describe('OffboardingService', () => {
  const ctx = { getCompanyId: jest.fn(() => 'company-1') };
  const organizationScope = {
    getBranchScopedWhere: jest.fn().mockResolvedValue({ tenantId: 'tenant-1', branchId: { in: ['branch-1', 'branch-2'] } }),
  };

  const staff = {
    id: 'staff-1',
    status: 'ACTIVE',
    branchId: 'branch-2',
    branch: { companyId: 'company-1' },
  };

  function createPrisma(overrides: Record<string, unknown> = {}) {
    const tx = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
      staff: { update: jest.fn() },
      ...overrides,
    };
    return {
      staff: { findFirst: jest.fn().mockResolvedValue(staff) },
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      tx,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    organizationScope.getBranchScopedWhere.mockResolvedValue({ tenantId: 'tenant-1', branchId: { in: ['branch-1', 'branch-2'] } });
  });

  it('uses assigned branches for staff lookup', async () => {
    const prisma = createPrisma();
    prisma.$queryRawUnsafe.mockResolvedValue([]);
    const service = new OffboardingService(prisma as never, ctx as never, organizationScope as never);

    await service.get('staff-1');

    expect(prisma.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'staff-1', tenantId: 'tenant-1', branchId: { in: ['branch-1', 'branch-2'] } }),
    }));
  });

  it('rejects a termination date before the employee hire date', async () => {
    const prisma = createPrisma();
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ hire_date: '2026-02-01', termination_date: null }]);
    const service = new OffboardingService(prisma as never, ctx as never, organizationScope as never);

    await expect(service.start('staff-1', { terminationDate: '2026-01-31', reason: 'Probation result' }, 'user-1'))
      .rejects.toThrow('Termination date cannot precede hire date.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a note when an offboarding task is skipped', async () => {
    const prisma = createPrisma();
    const service = new OffboardingService(prisma as never, ctx as never, organizationScope as never);

    await expect(service.updateTask('staff-1', 'task-1', { status: 'SKIPPED' }, 'user-1'))
      .rejects.toThrow('A completion note is required when skipping an offboarding task.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an owner outside active organization scope', async () => {
    const prisma = createPrisma();
    prisma.staff.findFirst.mockResolvedValueOnce(staff).mockResolvedValueOnce(null);
    const service = new OffboardingService(prisma as never, ctx as never, organizationScope as never);

    await expect(service.updateTask('staff-1', 'task-1', { status: 'IN_PROGRESS', ownerStaffId: 'foreign-staff' }, 'user-1'))
      .rejects.toThrow('Task owner must be an active staff member in the active organization scope.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns an idempotent result when completion is retried in scope', async () => {
    const prisma = createPrisma();
    prisma.tx.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'staff-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ termination_date: '2026-09-30' }]);
    const service = new OffboardingService(prisma as never, ctx as never, organizationScope as never);

    await expect(service.complete('staff-1', 'user-1')).resolves.toEqual({
      status: 'COMPLETED',
      terminationDate: '2026-09-30',
      idempotent: true,
    });
    expect(prisma.tx.staff.update).not.toHaveBeenCalled();
    expect(String(prisma.tx.$queryRawUnsafe.mock.calls[0][0])).toContain('ANY($4::text[])');
  });

  it('rejects completion when future employment history exists', async () => {
    const prisma = createPrisma();
    prisma.tx.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'staff-1' }])
      .mockResolvedValueOnce([{ id: 'plan-1', tenant_id: 'tenant-1', company_id: 'company-1', branch_id: 'branch-2', staff_id: 'staff-1', termination_date: '2026-09-30', termination_reason: 'Probation result', status: 'ACTIVE' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ hire_date: '2026-01-01', termination_date: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'history-current', effective_from: '2026-01-01' }])
      .mockResolvedValueOnce([{ id: 'history-future', effective_from: '2026-10-15' }]);
    const service = new OffboardingService(prisma as never, ctx as never, organizationScope as never);

    await expect(service.complete('staff-1', 'user-1')).rejects.toThrow('Future employment history exists after the termination date.');
  });
});
