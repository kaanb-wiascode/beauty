import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { OperationsStaffEligibilityService } from './operations-staff-eligibility.service';
import { ServiceExecutionStaffService } from './service-execution-staff.service';

describe('ServiceExecutionStaffService', () => {
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();
  const tx = {
    $queryRawUnsafe: queryRawUnsafe,
    $executeRawUnsafe: executeRawUnsafe,
  };
  const transaction = jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  const prisma = { $queryRawUnsafe: queryRawUnsafe, $transaction: transaction };
  const ctx = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
    getMembershipId: () => 'membership-1',
  };
  const eligibility = { check: jest.fn() };
  let service: ServiceExecutionStaffService;

  beforeEach(async () => {
    jest.clearAllMocks();
    eligibility.check.mockResolvedValue({ allowed: true, blockers: [] });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ServiceExecutionStaffService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: ctx },
        { provide: OperationsStaffEligibilityService, useValue: eligibility },
      ],
    }).compile();

    service = moduleRef.get(ServiceExecutionStaffService);
  });

  it('rejects assignment changes when execution is no longer in progress', async () => {
    queryRawUnsafe.mockResolvedValueOnce([{ id: 'execution-1', appointmentId: 'appointment-1', serviceId: 'service-1', status: 'COMPLETED', startAt: new Date(), endAt: new Date(Date.now() + 3600000) }]);
    await expect(service.add('execution-1', { staffId: 'staff-2', role: 'ASSISTANT' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects target staff blocked by the active eligibility policy', async () => {
    queryRawUnsafe.mockResolvedValueOnce([{ id: 'execution-1', appointmentId: 'appointment-1', serviceId: 'service-1', status: 'IN_PROGRESS', startAt: new Date(), endAt: new Date(Date.now() + 3600000) }]);
    eligibility.check.mockResolvedValue({ allowed: false, blockers: [{ code: 'STAFF_CERTIFICATION_MISSING' }] });
    await expect(service.add('execution-1', { staffId: 'staff-2', role: 'ASSISTANT' })).rejects.toBeInstanceOf(ConflictException);
  });
});
