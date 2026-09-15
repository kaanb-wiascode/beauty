import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  const ctx = { getCompanyId: jest.fn(() => 'company-1') };
  const organizationScope = {
    getBranchScopedWhere: jest.fn().mockResolvedValue({ tenantId: 'tenant-1', branchId: { in: ['branch-1', 'branch-2'] } }),
  };
  const staff = { id: 'staff-1', status: 'ACTIVE', branchId: 'branch-2', branch: { companyId: 'company-1' } };

  function prisma() {
    const tx = { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() };
    return {
      staff: { findFirst: jest.fn().mockResolvedValue(staff) },
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
      tx,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    organizationScope.getBranchScopedWhere.mockResolvedValue({ tenantId: 'tenant-1', branchId: { in: ['branch-1', 'branch-2'] } });
  });

  it('uses assigned branches for COMPANY staff lookup', async () => {
    const db = prisma();
    db.$queryRawUnsafe.mockResolvedValue([]);
    const service = new OnboardingService(db as never, ctx as never, organizationScope as never);
    await service.get('staff-1');
    expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'staff-1', tenantId: 'tenant-1', branchId: { in: ['branch-1', 'branch-2'] } }),
    }));
  });

  it('keeps CENTRAL company-wide lookup when branch scope is company relation', async () => {
    organizationScope.getBranchScopedWhere.mockResolvedValue({ tenantId: 'tenant-1', branch: { companyId: 'company-1' } });
    const db = prisma();
    db.$queryRawUnsafe.mockResolvedValue([]);
    const service = new OnboardingService(db as never, ctx as never, organizationScope as never);
    await service.get('staff-1');
    expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ branchId: expect.anything() }),
    }));
  });

  it('rejects target completion before start date', async () => {
    const db = prisma();
    const service = new OnboardingService(db as never, ctx as never, organizationScope as never);
    await expect(service.create('staff-1', { startedAt: '2026-09-15', targetCompletionDate: '2026-09-14' }, 'user-1'))
      .rejects.toThrow('Target completion date cannot precede onboarding start date.');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate task titles', async () => {
    const db = prisma();
    const service = new OnboardingService(db as never, ctx as never, organizationScope as never);
    await expect(service.create('staff-1', { tasks: ['SGK registration', 'sgk registration'] }, 'user-1'))
      .rejects.toThrow('Onboarding task titles must be unique.');
  });

  it('rejects a second active onboarding plan under scoped lock', async () => {
    const db = prisma();
    db.tx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'staff-1' }]).mockResolvedValueOnce([{ id: 'plan-1' }]);
    const service = new OnboardingService(db as never, ctx as never, organizationScope as never);
    await expect(service.create('staff-1', {}, 'user-1')).rejects.toThrow('An active onboarding plan already exists.');
    expect(String(db.tx.$queryRawUnsafe.mock.calls[0][0])).toContain('ANY($4::text[])');
  });

  it('requires a note when a task is skipped', async () => {
    const db = prisma();
    const service = new OnboardingService(db as never, ctx as never, organizationScope as never);
    await expect(service.updateTask('staff-1', 'task-1', { status: 'SKIPPED' }, 'user-1'))
      .rejects.toThrow('A completion note is required when skipping an onboarding task.');
  });

  it('rejects a task owner outside active organization scope', async () => {
    const db = prisma();
    db.staff.findFirst.mockResolvedValueOnce(staff).mockResolvedValueOnce(null);
    const service = new OnboardingService(db as never, ctx as never, organizationScope as never);
    await expect(service.updateTask('staff-1', 'task-1', { status: 'IN_PROGRESS', ownerStaffId: 'other' }, 'user-1'))
      .rejects.toThrow('Task owner must be an active staff member in the active organization scope.');
  });

  it('rejects updates when the onboarding plan is no longer active', async () => {
    const db = prisma();
    db.tx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'task-1', plan_id: 'plan-1', planStatus: 'COMPLETED' }]);
    const service = new OnboardingService(db as never, ctx as never, organizationScope as never);
    await expect(service.updateTask('staff-1', 'task-1', { status: 'COMPLETED' }, 'user-1'))
      .rejects.toThrow('Onboarding plan is not active.');
  });
});
