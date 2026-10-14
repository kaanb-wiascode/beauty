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
    };
    const prisma = {
      appointment: {
        findMany: jest.fn().mockResolvedValue([appointment]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
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
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    const query = prisma.appointment.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      status: 'CONFIRMED',
      AND: [
        { endAt: { gt: from } },
        { startAt: { lt: to } },
      ],
    });
    expect(query.include).toEqual(expect.objectContaining({
      customer: { select: { firstName: true, lastName: true } },
      service: { select: { name: true } },
      staff: { select: { firstName: true, lastName: true } },
      branch: { select: { name: true } },
    }));
    // Do not return contact details, medical notes or staff profile data.
    expect(query.include.customer.select.phone).toBeUndefined();
    expect(query.include.customer.select.email).toBeUndefined();
    expect(query.include.staff.select.profile).toBeUndefined();
    expect(prisma.appointment.count).toHaveBeenCalledWith({ where: query.where });
  });
});
