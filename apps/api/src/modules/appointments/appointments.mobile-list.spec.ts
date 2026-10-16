import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { AccountingService } from '../accounting/accounting.service';
import { CommerceFinanceSyncService } from '../finance/commerce-finance-sync.service';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService mobile reception list', () => {
  it('selects only minimal display names and preserves branch, status and date filters', async () => {
    const appointment = {
      id: 'appointment-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      status: 'CONFIRMED',
      customer: { firstName: 'Aylin', lastName: 'Demir' },
      service: { name: 'Cilt Bakımı' },
      staff: { firstName: 'Selin', lastName: 'Kaya' },
      branch: { name: 'Kadıköy' },
      customerId: 'customer-1',
      serviceId: 'service-1',
      staffId: 'staff-1',
      startAt: new Date('2026-10-15T10:00:00.000Z'),
      endAt: new Date('2026-10-15T11:00:00.000Z'),
      notes: 'Internal details must remain on server',
      payment: { amount: 500, method: 'CASH' },
      session: { customerPackage: { package: { name: 'Private bundle' } } },
    };
    // Explicit argument types ensure this test checks the query without
    // unsafely reading untyped Jest mock calls.
    const findMany = jest.fn((query: unknown) => {
      void query;
      return Promise.resolve([appointment]);
    });
    const count = jest.fn((query: unknown) => {
      void query;
      return Promise.resolve(1);
    });
    const prisma = { appointment: { findMany, count } };
    const tenant = { getTenantId: jest.fn().mockReturnValue('tenant-1') };
    const scope = {
      getBranchScopedWhere: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      }),
    };
    const service = new AppointmentsService(
      prisma as unknown as PrismaService,
      tenant as unknown as TenantContext,
      scope as unknown as OrganizationScopeService,
      {} as AccountingService,
      {} as CommerceFinanceSyncService,
    );
    const from = new Date('2026-10-15T00:00:00.000Z');
    const to = new Date('2026-10-22T00:00:00.000Z');

    const result = await service.findAll({
      page: 1,
      limit: 20,
      status: 'CONFIRMED',
      from,
      to,
    });

    expect(result.data).toEqual([appointment]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    const scopedWhere = {
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      status: 'CONFIRMED',
      AND: [{ endAt: { gt: from } }, { startAt: { lt: to } }],
    };
    const query = findMany.mock.calls[0]?.[0] as
      | {
          where: unknown;
          include: {
            customer: { select: Record<string, boolean> };
            service: { select: Record<string, boolean> };
            staff: { select: Record<string, boolean> };
            branch: { select: Record<string, boolean> };
          };
        }
      | undefined;

    expect(query?.where).toEqual(scopedWhere);
    expect(count).toHaveBeenCalledWith({ where: scopedWhere });
    // Exact select projections prevent accidental contact, profile or health
    // fields being added to the reception appointment list.
    expect(query?.include.customer.select).toEqual({
      firstName: true,
      lastName: true,
    });
    expect(query?.include.service.select).toEqual({ name: true });
    expect(query?.include.staff.select).toEqual({
      firstName: true,
      lastName: true,
    });
    expect(query?.include.branch.select).toEqual({ name: true });

    const mobile = await service.findMobileList({
      page: 1,
      limit: 20,
      status: 'CONFIRMED',
      from,
      to,
    });
    expect(mobile.data).toEqual([
      {
        id: appointment.id,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status,
        branchId: appointment.branchId,
        customerId: appointment.customerId,
        serviceId: appointment.serviceId,
        staffId: appointment.staffId,
        customer: appointment.customer,
        service: appointment.service,
        staff: appointment.staff,
        branch: appointment.branch,
      },
    ]);
    expect(mobile.data[0]).not.toHaveProperty('notes');
    expect(mobile.data[0]).not.toHaveProperty('payment');
    expect(mobile.data[0]).not.toHaveProperty('session');
  });
});
