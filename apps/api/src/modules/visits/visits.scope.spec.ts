import { ConflictException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { VisitsService } from './visits.service';

describe('VisitsService scope and concurrency', () => {
  const appointmentFindFirst = jest.fn();
  const customerFindFirst = jest.fn();
  const queryRawUnsafe = jest.fn();
  const executeRawUnsafe = jest.fn();

  const tx = {
    appointment: { findFirst: appointmentFindFirst },
    customer: { findFirst: customerFindFirst },
    $queryRawUnsafe: queryRawUnsafe,
    $executeRawUnsafe: executeRawUnsafe,
  };

  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaService;

  const tenantContext = {
    getTenantId: jest.fn().mockReturnValue('tenant-1'),
    getCompanyId: jest.fn().mockReturnValue('company-1'),
    getBranchId: jest.fn().mockReturnValue('branch-1'),
    getMembershipId: jest.fn().mockReturnValue('membership-1'),
  } as unknown as TenantContext;

  const service = new VisitsService(prisma, tenantContext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an appointment outside the active tenant and branch scope', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ locked: 1 }])
      .mockResolvedValueOnce([]);
    appointmentFindFirst.mockResolvedValue(null);

    await expect(
      service.checkIn({ appointmentId: '11111111-1111-4111-8111-111111111111' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(appointmentFindFirst).toHaveBeenCalledWith({
      where: {
        id: '11111111-1111-4111-8111-111111111111',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      },
      select: {
        id: true,
        customerId: true,
        status: true,
      },
    });
  });

  it('rejects a walk-in customer outside the active tenant and branch scope', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ locked: 1 }])
      .mockResolvedValueOnce([]);
    customerFindFirst.mockResolvedValue(null);

    await expect(
      service.checkIn({
        customerId: '22222222-2222-4222-8222-222222222222',
        idempotencyKey: 'walk-in-test-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(customerFindFirst).toHaveBeenCalledWith({
      where: {
        id: '22222222-2222-4222-8222-222222222222',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      },
      select: { id: true },
    });
  });

  it('fails safely when a transition uses a stale version', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'visit-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        branchId: 'branch-1',
        customerId: 'customer-1',
        source: 'APPOINTMENT',
        status: 'WAITING',
        note: null,
        idempotencyKey: null,
        arrivedAt: new Date(),
        checkedInAt: new Date(),
        serviceStartedAt: null,
        serviceCompletedAt: null,
        checkoutPendingAt: null,
        checkedOutAt: null,
        cancelledAt: null,
        version: 3,
        createdByMembershipId: 'membership-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(
      service.transition('visit-1', {
        toStatus: 'IN_SERVICE',
        expectedVersion: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });
});
