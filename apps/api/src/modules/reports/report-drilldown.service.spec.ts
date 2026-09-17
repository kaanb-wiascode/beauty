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
    getBranchScopedWhere.mockReset();
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
          serviceId: input.rowId,
        }),
      }),
    );
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
