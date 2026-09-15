import { ConflictException } from '@nestjs/common';
import { ServiceExecutionStaffService } from './service-execution-staff.service';

describe('ServiceExecutionStaffService', () => {
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();
  const transaction = jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn({
    $queryRawUnsafe: queryRawUnsafe,
    $executeRawUnsafe: executeRawUnsafe,
  }));
  const prisma = { $queryRawUnsafe: queryRawUnsafe, $transaction: transaction } as never;
  const ctx = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
    getMembershipId: () => 'membership-1',
  } as never;
  const eligibility = { check: jest.fn() } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    (eligibility.check as jest.Mock).mockResolvedValue({ allowed: true, blockers: [] });
  });

  it('rejects assignment changes when execution is no longer in progress', async () => {
    queryRawUnsafe.mockResolvedValueOnce([{ id: 'execution-1', appointmentId: 'appointment-1', serviceId: 'service-1', status: 'COMPLETED', startAt: new Date(), endAt: new Date(Date.now() + 3600000) }]);
    const service = new ServiceExecutionStaffService(prisma, ctx, eligibility);
    await expect(service.add('execution-1', { staffId: 'staff-2', role: 'ASSISTANT' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects target staff blocked by the active eligibility policy', async () => {
    queryRawUnsafe.mockResolvedValueOnce([{ id: 'execution-1', appointmentId: 'appointment-1', serviceId: 'service-1', status: 'IN_PROGRESS', startAt: new Date(), endAt: new Date(Date.now() + 3600000) }]);
    (eligibility.check as jest.Mock).mockResolvedValue({ allowed: false, blockers: [{ code: 'STAFF_CERTIFICATION_MISSING' }] });
    const service = new ServiceExecutionStaffService(prisma, ctx, eligibility);
    await expect(service.add('execution-1', { staffId: 'staff-2', role: 'ASSISTANT' })).rejects.toBeInstanceOf(ConflictException);
  });
});
