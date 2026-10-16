import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { OperationsStaffEligibilityService } from './operations-staff-eligibility.service';
import { WalkInServiceExecutionsService } from './walk-in-service-executions.service';

describe('WalkInServiceExecutionsService', () => {
  const queryRawUnsafe = jest.fn();
  const staffFindFirst = jest.fn();
  const prisma = {
    $queryRawUnsafe: queryRawUnsafe,
    staff: { findFirst: staffFindFirst },
  } as unknown as PrismaService;

  const tenantContext = {
    getTenantId: jest.fn().mockReturnValue('tenant-1'),
    getCompanyId: jest.fn().mockReturnValue('company-1'),
    getBranchId: jest.fn().mockReturnValue('branch-1'),
    getMembershipId: jest.fn().mockReturnValue('membership-1'),
  } as unknown as TenantContext;

  const eligibility = {
    check: jest.fn(),
  } as unknown as OperationsStaffEligibilityService;

  const service = new WalkInServiceExecutionsService(
    prisma,
    tenantContext,
    eligibility,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires the walk-in visit to be IN_SERVICE', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        contextId: 'context-1',
        visitId: 'visit-1',
        visitStatus: 'CHECKED_IN',
        customerId: 'customer-1',
        saleId: 'sale-1',
        saleStatus: 'CONFIRMED',
        saleItemId: 'item-1',
        serviceId: 'service-1',
        quantity: 1,
        durationMinutes: 45,
      },
    ]);

    await expect(
      service.start('visit-1', {
        commercialContextId: 'context-1',
        saleItemId: 'item-1',
        staffId: 'staff-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(staffFindFirst).not.toHaveBeenCalled();
  });

  it('requires one service unit per execution', async () => {
    queryRawUnsafe.mockResolvedValueOnce([
      {
        contextId: 'context-1',
        visitId: 'visit-1',
        visitStatus: 'IN_SERVICE',
        customerId: 'customer-1',
        saleId: 'sale-1',
        saleStatus: 'CONFIRMED',
        saleItemId: 'item-1',
        serviceId: 'service-1',
        quantity: 2,
        durationMinutes: 45,
      },
    ]);

    await expect(
      service.start('visit-1', {
        commercialContextId: 'context-1',
        saleItemId: 'item-1',
        staffId: 'staff-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(staffFindFirst).not.toHaveBeenCalled();
  });
});
