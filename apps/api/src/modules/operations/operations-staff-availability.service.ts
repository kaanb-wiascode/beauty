import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import type { StaffAvailabilityQueryInput } from './dto/staff-availability.dto';

type AvailabilityRow = {
  staffId: string;
  staffName: string;
  leaveType: string | null;
  leaveStatus: string | null;
  attendanceStatus: string | null;
  checkIn: Date | null;
  checkOut: Date | null;
  currentShiftId: string | null;
  currentShiftStart: Date | null;
  currentShiftEnd: Date | null;
  shiftScheduleConfigured: boolean;
  executionId: string | null;
  executionServiceName: string | null;
  currentAppointmentId: string | null;
  currentServiceName: string | null;
  currentAppointmentStart: Date | null;
  currentAppointmentEnd: Date | null;
  nextAppointmentId: string | null;
  nextServiceName: string | null;
  nextAppointmentStart: Date | null;
  nextAppointmentEnd: Date | null;
};

export type StaffOperationalAvailability =
  | 'AVAILABLE'
  | 'WITH_CUSTOMER'
  | 'OFF_SHIFT'
  | 'ON_LEAVE';

@Injectable()
export class OperationsStaffAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();

    if (!tenantId || !companyId) {
      throw new InternalServerErrorException(
        'Organization context is incomplete.',
      );
    }
    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }
    return { tenantId, companyId, branchId };
  }

  async board(input: StaffAvailabilityQueryInput) {
    const { tenantId, companyId, branchId } = this.context();
    const at = input.at;

    const rows = await this.prisma.$queryRawUnsafe<AvailabilityRow[]>(
      `SELECT st.id AS "staffId",
              trim(concat(st."firstName", ' ', st."lastName")) AS "staffName",
              leave_now.type AS "leaveType", leave_now.status AS "leaveStatus",
              attendance.status AS "attendanceStatus",
              attendance.check_in AS "checkIn", attendance.check_out AS "checkOut",
              current_shift.id AS "currentShiftId",
              current_shift.starts_at AS "currentShiftStart",
              current_shift.ends_at AS "currentShiftEnd",
              EXISTS (
                SELECT 1 FROM hr_scheduled_shifts configured
                WHERE configured.tenant_id=$1 AND configured.company_id=$4
                  AND configured.branch_id=$2 AND configured.status='PUBLISHED'
                  AND configured.starts_at < date_trunc('day',$3::timestamptz) + INTERVAL '1 day'
                  AND configured.ends_at > date_trunc('day',$3::timestamptz)
              ) AS "shiftScheduleConfigured",
              execution.id AS "executionId", execution.service_name AS "executionServiceName",
              current_appt.id AS "currentAppointmentId",
              current_appt.service_name AS "currentServiceName",
              current_appt.start_at AS "currentAppointmentStart",
              current_appt.end_at AS "currentAppointmentEnd",
              next_appt.id AS "nextAppointmentId",
              next_appt.service_name AS "nextServiceName",
              next_appt.start_at AS "nextAppointmentStart",
              next_appt.end_at AS "nextAppointmentEnd"
       FROM staff st
       LEFT JOIN LATERAL (
         SELECT lr.type, lr.status
         FROM leave_requests lr
         WHERE lr.tenant_id = $1 AND lr.branch_id = $2 AND lr.staff_id = st.id
           AND upper(lr.status) = 'APPROVED'
           AND lr.start_date <= ($3::timestamptz AT TIME ZONE 'UTC')::date
           AND lr.end_date >= ($3::timestamptz AT TIME ZONE 'UTC')::date
         ORDER BY lr.start_date ASC, lr.created_at ASC
         LIMIT 1
       ) leave_now ON TRUE
       LEFT JOIN LATERAL (
         SELECT ar.status, ar.check_in, ar.check_out
         FROM attendance_records ar
         WHERE ar.tenant_id = $1 AND ar.branch_id = $2 AND ar.staff_id = st.id
           AND ar.work_date = ($3::timestamptz AT TIME ZONE 'UTC')::date
         LIMIT 1
       ) attendance ON TRUE
       LEFT JOIN LATERAL (
         SELECT sh.id, sh.starts_at, sh.ends_at
         FROM hr_scheduled_shifts sh
         JOIN hr_shift_assignments sa ON sa.scheduled_shift_id=sh.id
         WHERE sh.tenant_id=$1 AND sh.company_id=$4 AND sh.branch_id=$2
           AND sh.status='PUBLISHED' AND sa.staff_id=st.id AND sa.status<>'CANCELLED'
           AND sh.starts_at <= $3 AND sh.ends_at > $3
         ORDER BY sh.starts_at DESC
         LIMIT 1
       ) current_shift ON TRUE
       LEFT JOIN LATERAL (
         SELECT e.id, s.name AS service_name
         FROM operations_service_executions e
         JOIN services s ON s.id = e.service_id
         WHERE e.tenant_id = $1 AND e.branch_id = $2 AND e.staff_id = st.id
           AND e.status::text = 'IN_PROGRESS'
           AND e.started_at <= $3
           AND (e.completed_at IS NULL OR e.completed_at > $3)
         ORDER BY e.started_at DESC
         LIMIT 1
       ) execution ON TRUE
       LEFT JOIN LATERAL (
         SELECT a.id, s.name AS service_name,
                a."startAt" AS start_at, a."endAt" AS end_at
         FROM appointments a
         JOIN services s ON s.id = a."serviceId"
         WHERE a."tenantId" = $1 AND a."branchId" = $2 AND a."staffId" = st.id
           AND a.status::text NOT IN ('CANCELLED', 'NO_SHOW')
           AND a."startAt" <= $3 AND a."endAt" > $3
         ORDER BY a."startAt" ASC
         LIMIT 1
       ) current_appt ON TRUE
       LEFT JOIN LATERAL (
         SELECT a.id, s.name AS service_name,
                a."startAt" AS start_at, a."endAt" AS end_at
         FROM appointments a
         JOIN services s ON s.id = a."serviceId"
         WHERE a."tenantId" = $1 AND a."branchId" = $2 AND a."staffId" = st.id
           AND a.status::text NOT IN ('CANCELLED', 'NO_SHOW')
           AND a."startAt" > $3
         ORDER BY a."startAt" ASC
         LIMIT 1
       ) next_appt ON TRUE
       WHERE st."tenantId" = $1 AND st."branchId" = $2
         AND st.status::text = 'ACTIVE'
       ORDER BY st."firstName" ASC, st."lastName" ASC`,
      tenantId,
      branchId,
      at,
      companyId,
    );

    const staff = rows.map((row) => {
      const absentAttendance = row.attendanceStatus
        ? ['ABSENT', 'OFF', 'OFF_SHIFT', 'LEAVE'].includes(
            row.attendanceStatus.toUpperCase(),
          )
        : false;

      let availability: StaffOperationalAvailability = 'AVAILABLE';
      let reason = 'No active operational blocker.';

      if (row.leaveStatus) {
        availability = 'ON_LEAVE';
        reason = row.leaveType
          ? `Approved leave: ${row.leaveType}`
          : 'Approved leave.';
      } else if (row.executionId) {
        availability = 'WITH_CUSTOMER';
        reason = row.executionServiceName
          ? `Service execution in progress: ${row.executionServiceName}`
          : 'Service execution in progress.';
      } else if (row.currentAppointmentId) {
        availability = 'WITH_CUSTOMER';
        reason = row.currentServiceName
          ? `Current appointment: ${row.currentServiceName}`
          : 'Current appointment.';
      } else if (row.shiftScheduleConfigured && !row.currentShiftId) {
        availability = 'OFF_SHIFT';
        reason = 'Personel şu anda yayınlanmış bir HR vardiyasına atanmamış.';
      } else if (absentAttendance) {
        availability = 'OFF_SHIFT';
        reason = `Attendance status: ${row.attendanceStatus}`;
      }

      return {
        staffId: row.staffId,
        staffName: row.staffName,
        availability,
        reason,
        shift: row.currentShiftId
          ? {
              id: row.currentShiftId,
              startsAt: row.currentShiftStart,
              endsAt: row.currentShiftEnd,
            }
          : null,
        attendance: row.attendanceStatus
          ? {
              status: row.attendanceStatus,
              checkIn: row.checkIn,
              checkOut: row.checkOut,
            }
          : null,
        current: row.executionId || row.currentAppointmentId
          ? {
              executionId: row.executionId,
              appointmentId: row.currentAppointmentId,
              serviceName:
                row.executionServiceName ?? row.currentServiceName ?? null,
              startAt: row.currentAppointmentStart,
              endAt: row.currentAppointmentEnd,
            }
          : null,
        nextAppointment: row.nextAppointmentId
          ? {
              id: row.nextAppointmentId,
              serviceName: row.nextServiceName,
              startAt: row.nextAppointmentStart,
              endAt: row.nextAppointmentEnd,
            }
          : null,
      };
    });

    const totals = staff.reduce(
      (acc, item) => {
        acc[item.availability] += 1;
        return acc;
      },
      {
        AVAILABLE: 0,
        WITH_CUSTOMER: 0,
        OFF_SHIFT: 0,
        ON_LEAVE: 0,
      } as Record<StaffOperationalAvailability, number>,
    );

    return {
      at,
      sourceOfTruth: {
        staff: 'HR',
        shifts: 'HR',
        leave: 'HR',
        attendance: 'HR',
        appointments: 'Appointments',
        executions: 'Operations',
      },
      shiftAware: true,
      dateBasis: 'UTC_DATE' as const,
      limitations: [
        'When no published HR schedule exists for the branch/date, missing shift assignment is not interpreted as off-shift to preserve backward compatibility.',
        'Training session conflicts are not yet a separate live availability status.',
      ],
      totals,
      staff,
    };
  }
}
