import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '@beauty-erp/database';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { ServicesService } from '../services/services.service';
import { StaffService } from '../staff/staff.service';
import type { ReportDrilldownInput } from './dto/report-drilldown.dto';
import { ReportDrilldownService } from './report-drilldown.service';
import { ReportsService } from './reports.service';

const user: JwtPayload = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  branchId: '22222222-2222-4222-8222-222222222222',
  membershipId: 'membership-1',
  roleId: 'role-1',
  roleScope: 'BRANCH',
};

const input: ReportDrilldownInput = {
  reportKey: 'staff.performance',
  dimension: 'appointments',
  rowId: '11111111-1111-4111-8111-111111111111',
  filters: {
    from: new Date('2026-09-01T00:00:00.000Z'),
    to: new Date('2026-09-30T23:59:59.999Z'),
  },
  page: 1,
  limit: 25,
};

describe('ReportDrilldownService', () => {
  const appointmentFindMany = jest.fn();
  const appointmentCount = jest.fn();
  const branchFindFirst = jest.fn();
  const customerFindFirst = jest.fn();
  const saleFindFirst = jest.fn();
  const getBranchScopedWhere = jest.fn();
  const staffFindOne = jest.fn();
  const serviceFindOne = jest.fn();
  const getCatalog = jest.fn();
  let service: ReportDrilldownService;

  beforeEach(async () => {
    appointmentFindMany.mockReset().mockResolvedValue([
      {
        id: 'appointment-1',
        startAt: new Date('2026-09-15T10:00:00.000Z'),
        endAt: new Date('2026-09-15T11:00:00.000Z'),
        status: 'COMPLETED',
        payment: { amount: 1250, status: 'COMPLETED' },
      },
    ]);
    appointmentCount.mockReset().mockResolvedValue(1);
    branchFindFirst.mockReset();
    customerFindFirst.mockReset();
    saleFindFirst.mockReset();
    getBranchScopedWhere.mockReset().mockResolvedValue({
      tenantId: 'tenant-1',
      branchId: { in: [user.branchId] },
    });
    staffFindOne.mockReset().mockResolvedValue({ id: input.rowId });
    serviceFindOne.mockReset();
    getCatalog
      .mockReset()
      .mockResolvedValue([{ key: 'staff.performance' }]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportDrilldownService,
        {
          provide: PrismaService,
          useValue: {
            appointment: {
              findMany: appointmentFindMany,
              count: appointmentCount,
            },
            branch: { findFirst: branchFindFirst },
            customer: { findFirst: customerFindFirst },
            sale: { findFirst: saleFindFirst },
          },
        },
        {
          provide: OrganizationScopeService,
          useValue: { getBranchScopedWhere },
        },
        { provide: StaffService, useValue: { findOne: staffFindOne } },
        { provide: ServicesService, useValue: { findOne: serviceFindOne } },
        { provide: ReportsService, useValue: { getCatalog } },
      ],
    }).compile();

    service = moduleRef.get(ReportDrilldownService);
  });

  it('validates the parent entity before querying tenant-scoped appointments', async () => {
    const result = await service.drilldown(user, input);

    expect(staffFindOne).toHaveBeenCalledWith(input.rowId);
    expect(appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          branchId: { in: [user.branchId] },
          staffId: input.rowId,
          startAt: { gte: input.filters.from, lte: input.filters.to },
        }),
      }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'appointment-1',
        paymentAmount: 1250,
        paymentStatus: 'COMPLETED',
      }),
    );
  });

  it('does not query child rows after report permission revocation', async () => {
    getCatalog.mockResolvedValueOnce([]);

    await expect(service.drilldown(user, input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(staffFindOne).not.toHaveBeenCalled();
    expect(appointmentFindMany).not.toHaveBeenCalled();
  });

  it('uses service scope validation for service performance drilldowns', async () => {
    getCatalog.mockResolvedValueOnce([{ key: 'service.performance' }]);
    serviceFindOne.mockResolvedValueOnce({ id: input.rowId });

    await service.drilldown(user, {
      ...input,
      reportKey: 'service.performance',
    });

    expect(serviceFindOne).toHaveBeenCalledWith(input.rowId);
    expect(appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          branchId: { in: [user.branchId] },
          serviceId: input.rowId,
        }),
      }),
    );
  });

  it('queries customer appointments only after the customer is confirmed inside organization scope', async () => {
    getCatalog.mockResolvedValueOnce([{ key: 'customers.performance' }]);
    getBranchScopedWhere.mockResolvedValueOnce({
      tenantId: 'tenant-1',
      branchId: { in: [user.branchId] },
    });
    customerFindFirst.mockResolvedValueOnce({ id: input.rowId });

    await service.drilldown(user, {
      ...input,
      reportKey: 'customers.performance',
    });

    expect(customerFindFirst).toHaveBeenCalledWith({
      where: {
        id: input.rowId,
        tenantId: 'tenant-1',
        branchId: { in: [user.branchId] },
      },
      select: { id: true },
    });
    expect(appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: user.tenantId,
          branchId: { in: [user.branchId] },
          customerId: input.rowId,
        }),
      }),
    );
  });

  it('rejects customer row ids outside organization scope before any child query', async () => {
    getCatalog.mockResolvedValueOnce([{ key: 'customers.performance' }]);
    getBranchScopedWhere.mockResolvedValueOnce({
      tenantId: 'tenant-1',
      branchId: { in: [user.branchId] },
    });
    customerFindFirst.mockResolvedValueOnce(null);

    await expect(
      service.drilldown(user, {
        ...input,
        reportKey: 'customers.performance',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(appointmentFindMany).not.toHaveBeenCalled();
    expect(appointmentCount).not.toHaveBeenCalled();
  });

  it('returns a scoped safe sale projection for sales performance drilldown', async () => {
    getCatalog.mockResolvedValueOnce([{ key: 'sales.performance' }]);
    saleFindFirst.mockResolvedValueOnce({
      id: input.rowId,
      confirmedAt: new Date('2026-09-15T12:00:00.000Z'),
      status: 'CONFIRMED',
      subtotal: 1600,
      discountTotal: 100,
      total: 1500,
      items: [
        {
          id: 'item-1',
          type: 'SERVICE',
          description: 'Cilt Bakımı',
          quantity: 1,
          unitPrice: 1600,
          lineTotal: 1600,
        },
      ],
      payments: [
        {
          id: 'payment-1',
          amount: 1500,
          method: 'CARD',
          status: 'COMPLETED',
          paidAt: new Date('2026-09-15T12:05:00.000Z'),
          refundedAt: null,
        },
      ],
    });

    const result = await service.drilldown(user, {
      ...input,
      reportKey: 'sales.performance',
      dimension: 'sale',
    });

    expect(saleFindFirst).toHaveBeenCalledWith({
      where: {
        id: input.rowId,
        tenantId: 'tenant-1',
        branchId: { in: [user.branchId] },
        status: 'CONFIRMED',
        confirmedAt: {
          gte: input.filters.from,
          lte: input.filters.to,
        },
      },
      select: expect.objectContaining({
        id: true,
        confirmedAt: true,
        status: true,
        subtotal: true,
        discountTotal: true,
        total: true,
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        report: {
          key: 'sales.performance',
          dimension: 'sale',
          rowId: input.rowId,
        },
        data: expect.objectContaining({
          id: input.rowId,
          subtotal: 1600,
          discountTotal: 100,
          total: 1500,
          items: [
            expect.objectContaining({
              description: 'Cilt Bakımı',
              unitPrice: 1600,
              lineTotal: 1600,
            }),
          ],
          payments: [
            expect.objectContaining({
              amount: 1500,
              method: 'CARD',
              status: 'COMPLETED',
            }),
          ],
        }),
      }),
    );
    expect(result.data).not.toHaveProperty('customer');
    expect(result.data.payments[0]).not.toHaveProperty('note');
    expect(result.data.payments[0]).not.toHaveProperty('reference');
  });

  it('rejects sales outside scope, status or report period as not found', async () => {
    getCatalog.mockResolvedValueOnce([{ key: 'sales.performance' }]);
    saleFindFirst.mockResolvedValueOnce(null);

    await expect(
      service.drilldown(user, {
        ...input,
        reportKey: 'sales.performance',
        dimension: 'sale',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(appointmentFindMany).not.toHaveBeenCalled();
    expect(appointmentCount).not.toHaveBeenCalled();
  });

  it('bounds appointment performance drilldown to the selected UTC day and organization scope', async () => {
    getCatalog.mockResolvedValueOnce([{ key: 'appointments.performance' }]);

    await service.drilldown(user, {
      ...input,
      reportKey: 'appointments.performance',
      rowId: '2026-09-15',
    });

    expect(appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          branchId: { in: [user.branchId] },
          startAt: {
            gte: new Date('2026-09-15T00:00:00.000Z'),
            lte: new Date('2026-09-15T23:59:59.999Z'),
          },
        },
      }),
    );
  });

  it('rejects appointment day rows outside the requested filter before any child query', async () => {
    getCatalog.mockResolvedValueOnce([{ key: 'appointments.performance' }]);

    await expect(
      service.drilldown(user, {
        ...input,
        reportKey: 'appointments.performance',
        rowId: '2026-08-31',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(appointmentFindMany).not.toHaveBeenCalled();
    expect(appointmentCount).not.toHaveBeenCalled();
  });

  it('queries appointments only after an active branch is confirmed inside organization scope', async () => {
    getCatalog.mockResolvedValueOnce([{ key: 'branches.performance' }]);
    getBranchScopedWhere.mockResolvedValueOnce({
      tenantId: 'tenant-1',
      branchId: { in: [input.rowId] },
    });
    branchFindFirst.mockResolvedValueOnce({ id: input.rowId });

    await service.drilldown(user, {
      ...input,
      reportKey: 'branches.performance',
    });

    expect(branchFindFirst).toHaveBeenCalledWith({
      where: {
        id: input.rowId,
        companyId: user.companyId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: user.tenantId,
          branchId: input.rowId,
        }),
      }),
    );
  });

  it('rejects branch row ids outside organization scope before any child query', async () => {
    getCatalog.mockResolvedValueOnce([{ key: 'branches.performance' }]);
    getBranchScopedWhere.mockResolvedValueOnce({
      tenantId: 'tenant-1',
      branchId: { in: ['33333333-3333-4333-8333-333333333333'] },
    });

    await expect(
      service.drilldown(user, {
        ...input,
        reportKey: 'branches.performance',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(branchFindFirst).not.toHaveBeenCalled();
    expect(appointmentFindMany).not.toHaveBeenCalled();
    expect(appointmentCount).not.toHaveBeenCalled();
  });
});
