import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import type { OperationsCapacityQueryInput } from './dto/operations-resource.dto';

type StaffRow = {
  id: string;
  firstName: string;
  lastName: string;
};

type AppointmentRow = {
  id: string;
  staffId: string;
  serviceId: string;
  serviceName: string;
  startAt: Date;
  endAt: Date;
};

type Interval = { from: number; to: number };

function mergedMinutes(intervals: Interval[]) {
  if (!intervals.length) return 0;
  const sorted = [...intervals].sort((left, right) => left.from - right.from);
  let currentFrom = sorted[0].from;
  let currentTo = sorted[0].to;
  let total = 0;

  for (const interval of sorted.slice(1)) {
    if (interval.from <= currentTo) {
      currentTo = Math.max(currentTo, interval.to);
      continue;
    }
    total += currentTo - currentFrom;
    currentFrom = interval.from;
    currentTo = interval.to;
  }
  total += currentTo - currentFrom;
  return Math.ceil(total / 60_000);
}

@Injectable()
export class OperationsUtilizationService {
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

  async summary(input: OperationsCapacityQueryInput) {
    const { tenantId, branchId } = this.context();
    const from = input.from;
    const to = input.to;
    const windowMinutes = Math.ceil((to.getTime() - from.getTime()) / 60_000);

    if (windowMinutes <= 0 || windowMinutes > 7 * 24 * 60) {
      throw new BadRequestException(
        'Utilization window must be greater than zero and no longer than seven days.',
      );
    }

    const [staff, appointments] = await Promise.all([
      this.prisma.staff.findMany({
        where: { tenantId, branchId, status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }) as Promise<StaffRow[]>,
      this.prisma.$queryRawUnsafe<AppointmentRow[]>(
        `SELECT a.id, a."staffId" AS "staffId", a."serviceId" AS "serviceId",
                s.name AS "serviceName", a."startAt" AS "startAt", a."endAt" AS "endAt"
         FROM appointments a
         JOIN services s ON s.id = a."serviceId"
         WHERE a."tenantId" = $1 AND a."branchId" = $2
           AND a.status NOT IN ('CANCELLED'::"AppointmentStatus", 'NO_SHOW'::"AppointmentStatus")
           AND a."startAt" < $4 AND a."endAt" > $3
         ORDER BY a."startAt" ASC`,
        tenantId,
        branchId,
        from,
        to,
      ),
    ]);

    const staffMetrics = staff.map((member) => {
      const memberAppointments = appointments.filter(
        (appointment) => appointment.staffId === member.id,
      );
      const intervals = memberAppointments.map((appointment) => ({
        from: Math.max(from.getTime(), appointment.startAt.getTime()),
        to: Math.min(to.getTime(), appointment.endAt.getTime()),
      }));
      const bookedMinutes = Math.min(windowMinutes, mergedMinutes(intervals));
      return {
        staffId: member.id,
        staffName: `${member.firstName} ${member.lastName}`.trim(),
        capacityMinutes: windowMinutes,
        bookedMinutes,
        availableMinutes: Math.max(0, windowMinutes - bookedMinutes),
        utilizationPercent:
          Math.round((bookedMinutes / windowMinutes) * 10_000) / 100,
        appointmentCount: memberAppointments.length,
      };
    });

    const serviceMap = new Map<
      string,
      { serviceId: string; serviceName: string; bookedMinutes: number; appointmentCount: number }
    >();
    for (const appointment of appointments) {
      const overlapFrom = Math.max(from.getTime(), appointment.startAt.getTime());
      const overlapTo = Math.min(to.getTime(), appointment.endAt.getTime());
      if (overlapFrom >= overlapTo) continue;
      const minutes = Math.ceil((overlapTo - overlapFrom) / 60_000);
      const current = serviceMap.get(appointment.serviceId) ?? {
        serviceId: appointment.serviceId,
        serviceName: appointment.serviceName,
        bookedMinutes: 0,
        appointmentCount: 0,
      };
      current.bookedMinutes += minutes;
      current.appointmentCount += 1;
      serviceMap.set(appointment.serviceId, current);
    }

    const totalBookedStaffMinutes = staffMetrics.reduce(
      (sum, metric) => sum + metric.bookedMinutes,
      0,
    );
    const totalStaffCapacityMinutes = staff.length * windowMinutes;
    const services = Array.from(serviceMap.values())
      .map((service) => ({
        ...service,
        shareOfBookedMinutesPercent:
          totalBookedStaffMinutes === 0
            ? 0
            : Math.round(
                (service.bookedMinutes / totalBookedStaffMinutes) * 10_000,
              ) / 100,
      }))
      .sort((left, right) => right.bookedMinutes - left.bookedMinutes);

    return {
      from,
      to,
      windowMinutes,
      availabilityBasis: 'REQUEST_WINDOW' as const,
      shiftAware: false,
      totals: {
        activeStaff: staff.length,
        capacityMinutes: totalStaffCapacityMinutes,
        bookedMinutes: totalBookedStaffMinutes,
        availableMinutes: Math.max(
          0,
          totalStaffCapacityMinutes - totalBookedStaffMinutes,
        ),
        utilizationPercent:
          totalStaffCapacityMinutes === 0
            ? 0
            : Math.round(
                (totalBookedStaffMinutes / totalStaffCapacityMinutes) * 10_000,
              ) / 100,
      },
      staff: staffMetrics.sort(
        (left, right) => right.utilizationPercent - left.utilizationPercent,
      ),
      services,
    };
  }
}
