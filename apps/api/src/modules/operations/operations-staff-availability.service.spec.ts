import { Test } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { OperationsStaffAvailabilityService } from './operations-staff-availability.service';

describe('OperationsStaffAvailabilityService', () => {
  const queryRawUnsafe = jest.fn(
    async (..._args: unknown[]): Promise<unknown[]> => [],
  );
  const prisma = { $queryRawUnsafe: queryRawUnsafe };
  const tenantContext = {
    getTenantId: () => 'tenant-1',
    getCompanyId: () => 'company-1',
    getBranchId: () => 'branch-1',
  };
  let service: OperationsStaffAvailabilityService;

  beforeEach(async () => {
    queryRawUnsafe.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OperationsStaffAvailabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContext, useValue: tenantContext },
      ],
    }).compile();
    service = moduleRef.get(OperationsStaffAvailabilityService);
  });

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
        currentShiftId: null,
        currentShiftStart: null,
        currentShiftEnd: null,
        shiftScheduleConfigured: false,
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
        currentShiftId: null,
        currentShiftStart: null,
        currentShiftEnd: null,
        shiftScheduleConfigured: false,
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
        currentShiftId: null,
        currentShiftStart: null,
        currentShiftEnd: null,
        shiftScheduleConfigured: false,
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

    const result = await service.board({ at: new Date() });

    expect(result.staff[0].availability).toBe('WITH_CUSTOMER');
    expect(result.staff[1].availability).toBe('OFF_SHIFT');
    expect(result.shiftAware).toBe(true);
  });
});
