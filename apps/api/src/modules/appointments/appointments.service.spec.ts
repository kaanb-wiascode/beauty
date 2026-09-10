import { NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService branch scope', () => {
  const findFirst = jest.fn();
  const findMany = jest.fn();
  const count = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const prisma = { appointment: { findFirst, findMany, count, create, update }, customer: { findFirst }, staff: { findFirst }, service: { findFirst } } as any;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
    getRoleScope: () => 'BRANCH',
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('rejects findOne for an appointment outside the active branch', async () => {
    findFirst.mockResolvedValueOnce(null);
    const service = new AppointmentsService(prisma, tenantContext);

    await expect(service.findOne('appointment-other-branch')).rejects.toBeInstanceOf(NotFoundException);

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'appointment-other-branch', tenantId: 'tenant-1', branchId: 'branch-1' },
      include: expect.any(Object),
    });
  });

  it('rejects create when any referenced record belongs to another branch', async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'staff-1', status: 'ACTIVE' })
      .mockResolvedValueOnce({ id: 'service-1', status: 'ACTIVE' });
    const service = new AppointmentsService(prisma, tenantContext);

    await expect(service.create({
      customerId: 'customer-other-branch',
      staffId: 'staff-1',
      serviceId: 'service-1',
      startAt: new Date('2026-09-10T10:00:00.000Z'),
      endAt: new Date('2026-09-10T11:00:00.000Z'),
    } as any)).rejects.toBeInstanceOf(NotFoundException);

    expect(findFirst).toHaveBeenCalledTimes(3);
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: 'customer-other-branch',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
    });
    expect(findFirst.mock.calls[1][0].where).toEqual({
      id: 'staff-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
    });
    expect(findFirst.mock.calls[2][0].where).toEqual({
      id: 'service-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
    });
    expect(create).not.toHaveBeenCalled();
  });
});
