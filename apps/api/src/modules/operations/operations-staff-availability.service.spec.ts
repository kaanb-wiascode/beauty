import { OperationsStaffAvailabilityService } from './operations-staff-availability.service';

describe('OperationsStaffAvailabilityService', () => {
  const queryRawUnsafe = jest.fn();
  const prisma = { $queryRawUnsafe: queryRawUnsafe } as never;
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
  } as never;

  beforeEach(() => queryRawUnsafe.mockReset());

  it('prioritizes approved leave over appointments and executions', async () => {
    queryRawUnsafe.mockResolvedValue([
      {
        staffId: 'staff-1',
        staffName: 'Ada Yılmaz',
        leaveType: 'ANNUAL',
        leaveStatus: 'APPROVED',
        attendanceStatus: 'PRESENT',
        checkIn: new Date('2026-09-15T06:00:00.000Z'),
        checkOut: null,
        executionId: 'execution-1',
        executionServiceName: 'Lazer',
        currentAppointmentId: 'appointment-1',
        currentServiceName: 'Lazer',
        currentAppointmentStart: new Date('2026-09-15T09:00:00.000Z'),
        currentAppointmentEnd: new Date('2026-09-15T10:00:00.000Z'),
        nextAppointmentId: null,
        nextServiceName: null,
        nextAppointmentStart: null,
        nextAppointmentEnd: null,
      },
    ]);

    const service = new OperationsStaffAvailabilityService(prisma, tenantContext);
    const result = await service.board({
      at: new Date('2026-09-15T09:30:00.000Z'),
    });

    expect(result.staff[0]).toEqual(
      expect.objectContaining({
        availability: 'ON_LEAVE',
        reason: 'Approved leave: ANNUAL',
      }),
    );
    expect(result.totals.ON_LEAVE).toBe(1);
  });

  it('uses live execution before appointment and explicit absence before available', async () => {
    queryRawUnsafe.mockResolvedValue([
      {
        staffId: 'staff-1',
        staffName: 'Ada Yılmaz',
        leaveType: null,
        leaveStatus: null,
        attendanceStatus: 'PRESENT',
        checkIn: null,
        checkOut: null,
        executionId: 'execution-1',
        executionServiceName: 'Cilt Bakımı',
        currentAppointmentId: 'appointment-1',
        currentServiceName: 'Cilt Bakımı',
        currentAppointmentStart: new Date(),
        currentAppointmentEnd: new Date(),
        nextAppointmentId: null,
        nextServiceName: null,
        nextAppointmentStart: null,
        nextAppointmentEnd: null,
      },
      {
        staffId: 'staff-2',
        staffName: 'Ece Demir',
        leaveType: null,
        leaveStatus: null,
        attendanceStatus: 'ABSENT',
        checkIn: null,
        checkOut: null,
        executionId: null,
        executionServiceName: null,
        currentAppointmentId: null,
        currentServiceName: null,
        currentAppointmentStart: null,
        currentAppointmentEnd: null,
        nextAppointmentId: null,
        nextServiceName: null,
        nextAppointmentStart: null,
        nextAppointmentEnd: null,
      },
    ]);

    const service = new OperationsStaffAvailabilityService(prisma, tenantContext);
    const result = await service.board({ at: new Date() });

    expect(result.staff[0].availability).toBe('WITH_CUSTOMER');
    expect(result.staff[1].availability).toBe('OFF_SHIFT');
    expect(result.shiftAware).toBe(false);
  });
});
