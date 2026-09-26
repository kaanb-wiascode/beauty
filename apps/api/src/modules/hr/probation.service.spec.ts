import { ProbationService } from './probation.service';

describe('ProbationService', () => {
  const ctx = { getTenantId: jest.fn(() => 'tenant-1'), getCompanyId: jest.fn(() => 'company-1') };
  const organizationScope = { getBranchScopedWhere: jest.fn().mockResolvedValue({ tenantId: 'tenant-1', branch: { companyId: 'company-1' } }) };
  const staff = { id: 'staff-1', status: 'ACTIVE', branchId: 'branch-2', branch: { companyId: 'company-1' } };
  function db() {
    const tx = { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() };
    return { staff: { findFirst: jest.fn().mockResolvedValue(staff) }, $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn(), $transaction: jest.fn(async (cb: (x: typeof tx) => unknown) => cb(tx)), tx };
  }
  beforeEach(() => jest.clearAllMocks());

  it('does not branch constrain CENTRAL company-wide staff lookup', async () => {
    const prisma = db(); prisma.$queryRawUnsafe.mockResolvedValue([]);
    await new ProbationService(prisma as never, ctx as never, organizationScope as never).get('staff-1');
    expect(prisma.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'staff-1', tenantId: 'tenant-1', branch: { companyId: 'company-1' } } }));
  });

  it('rejects self review assignment', async () => {
    const prisma = db();
    await expect(new ProbationService(prisma as never, ctx as never, organizationScope as never).start('staff-1', { reviewerStaffId: 'staff-1' }, 'user-1')).rejects.toThrow('Employee cannot review their own probation.');
  });

  it('rejects inactive or cross-branch reviewer', async () => {
    const prisma = db(); prisma.staff.findFirst.mockResolvedValueOnce(staff).mockResolvedValueOnce(null);
    await expect(new ProbationService(prisma as never, ctx as never, organizationScope as never).start('staff-1', { reviewerStaffId: 'reviewer-2' }, 'user-1')).rejects.toThrow('Reviewer must be active and within the employee branch scope.');
  });

  it('requires rating for completed review', async () => {
    const prisma = db();
    await expect(new ProbationService(prisma as never, ctx as never, organizationScope as never).review('staff-1', 'review-1', { status: 'COMPLETED' }, 'user-1')).rejects.toThrow('Rating is required for a completed probation review.');
  });

  it('requires manager note for skipped review', async () => {
    const prisma = db();
    await expect(new ProbationService(prisma as never, ctx as never, organizationScope as never).review('staff-1', 'review-1', { status: 'SKIPPED' }, 'user-1')).rejects.toThrow('A manager note is required when skipping a probation review.');
  });

  it('rejects final decision with unfinished reviews', async () => {
    const prisma = db();
    prisma.tx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'staff-1' }]).mockResolvedValueOnce([{ id: 'probation-1', end_at: '2026-10-01' }]).mockResolvedValueOnce([{ count: 2 }]);
    await expect(new ProbationService(prisma as never, ctx as never, organizationScope as never).decide('staff-1', { decision: 'CONFIRMED' }, 'user-1')).rejects.toThrow('Probation has 2 unfinished review(s).');
  });

  it('requires a later date for extension', async () => {
    const prisma = db();
    prisma.tx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'staff-1' }]).mockResolvedValueOnce([{ id: 'probation-1', end_at: '2026-10-01' }]);
    await expect(new ProbationService(prisma as never, ctx as never, organizationScope as never).decide('staff-1', { decision: 'EXTENDED', endAt: '2026-10-01' }, 'user-1')).rejects.toThrow('Extended end date must be later than current end date.');
  });

  it('rejects probation termination before hire date', async () => {
    const prisma = db();
    prisma.tx.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'staff-1' }])
      .mockResolvedValueOnce([{ id: 'probation-1', end_at: '2026-10-01' }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ hire_date: '2026-02-01' }]);
    await expect(new ProbationService(prisma as never, ctx as never, organizationScope as never).decide('staff-1', { decision: 'TERMINATED', terminationDate: '2026-01-31' }, 'user-1')).rejects.toThrow('Termination date cannot precede hire date.');
  });
});
