import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { AccountingService } from '../accounting/accounting.service';
import { CommerceFinanceSyncService } from '../finance/commerce-finance-sync.service';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService mobile detail', () => {
  const appointmentId = 'appointment-1';
  const scopeWhere = { tenantId: 'tenant-1', branchId: 'branch-1' };
  const findFirst = jest.fn();
  const scope = {
    getBranchScopedWhere: jest.fn().mockResolvedValue(scopeWhere),
  };
  const service = new AppointmentsService(
    { appointment: { findFirst } } as unknown as PrismaService,
    {} as TenantContext,
    scope as unknown as OrganizationScopeService,
    {} as AccountingService,
    {} as CommerceFinanceSyncService,
  );

  beforeEach(() => {
    findFirst.mockReset();
    scope.getBranchScopedWhere.mockClear();
  });

  it('reads only permitted fields within the current organization scope', async () => {
    const detail = { id: appointmentId, status: 'CONFIRMED' };
    findFirst.mockResolvedValue(detail);
    await expect(service.findMobileDetail(appointmentId)).resolves.toEqual(
      detail,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: appointmentId, ...scopeWhere },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        branchId: true,
        customerId: true,
        serviceId: true,
        staffId: true,
        customer: { select: { firstName: true, lastName: true } },
        service: { select: { name: true } },
        staff: { select: { firstName: true, lastName: true } },
        branch: { select: { name: true } },
      },
    });
  });

  it('does not disclose the existence of an out-of-scope appointment', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.findMobileDetail(appointmentId)).rejects.toThrow(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: appointmentId, ...scopeWhere } }),
    );
  });
});
