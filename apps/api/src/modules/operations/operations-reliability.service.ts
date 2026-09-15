import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class OperationsReliabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    if (!tenantId || !companyId) {
      throw new InternalServerErrorException('Organization context is incomplete.');
    }
    if (!branchId) {
      throw new BadRequestException('A branch must be selected for this operation.');
    }
    return { tenantId, companyId, branchId };
  }

  async summary(days = 180) {
    const { tenantId, companyId, branchId } = this.context();
    const safeDays = Math.min(Math.max(days, 30), 365);

    const totals = await this.prisma.$queryRawUnsafe<
      Array<{
        totalAppointments: number;
        completedAppointments: number;
        noShows: number;
        cancellations: number;
        lateCancellations: number;
        engagementRecords: number;
        confirmed: number;
        rescheduleRequests: number;
        cancelRequests: number;
      }>
    >(
      `WITH scoped AS (
         SELECT a.id, a."startAt", a.status::text AS status
         FROM appointments a
         WHERE a."tenantId" = $1 AND a."branchId" = $3
           AND a."startAt" >= CURRENT_TIMESTAMP - ($4::int * INTERVAL '1 day')
           AND a."startAt" <= CURRENT_TIMESTAMP
       ), outcomes AS (
         SELECT o.appointment_id, o.outcome, o.occurred_at
         FROM operations_appointment_outcomes o
         JOIN scoped s ON s.id = o.appointment_id
         WHERE o.tenant_id = $1 AND o.company_id = $2 AND o.branch_id = $3
       ), engagement AS (
         SELECT e.appointment_id, e.confirmation_status
         FROM operations_appointment_engagement e
         JOIN scoped s ON s.id = e.appointment_id
         WHERE e.tenant_id = $1 AND e.company_id = $2 AND e.branch_id = $3
       )
       SELECT
         COUNT(*)::int AS "totalAppointments",
         COUNT(*) FILTER (WHERE s.status = 'COMPLETED')::int AS "completedAppointments",
         COUNT(*) FILTER (WHERE s.status = 'NO_SHOW')::int AS "noShows",
         COUNT(*) FILTER (WHERE s.status = 'CANCELLED')::int AS cancellations,
         COUNT(*) FILTER (
           WHERE o.outcome = 'CANCELLED'
             AND o.occurred_at >= s."startAt" - INTERVAL '24 hours'
         )::int AS "lateCancellations",
         COUNT(e.appointment_id)::int AS "engagementRecords",
         COUNT(*) FILTER (WHERE e.confirmation_status = 'CONFIRMED')::int AS confirmed,
         COUNT(*) FILTER (WHERE e.confirmation_status = 'RESCHEDULE_REQUESTED')::int AS "rescheduleRequests",
         COUNT(*) FILTER (WHERE e.confirmation_status = 'CANCEL_REQUESTED')::int AS "cancelRequests"
       FROM scoped s
       LEFT JOIN outcomes o ON o.appointment_id = s.id
       LEFT JOIN engagement e ON e.appointment_id = s.id`,
      tenantId,
      companyId,
      branchId,
      safeDays,
    );

    const byCustomer = await this.prisma.$queryRawUnsafe<
      Array<{
        customerId: string;
        customerName: string;
        appointmentCount: number;
        completedCount: number;
        noShowCount: number;
        lateCancellationCount: number;
        confirmedCount: number;
        confirmationTrackedCount: number;
      }>
    >(
      `WITH scoped AS (
         SELECT a.id, a."customerId", a."startAt", a.status::text AS status
         FROM appointments a
         WHERE a."tenantId" = $1 AND a."branchId" = $3
           AND a."startAt" >= CURRENT_TIMESTAMP - ($4::int * INTERVAL '1 day')
           AND a."startAt" <= CURRENT_TIMESTAMP
       )
       SELECT s."customerId" AS "customerId",
              trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
              COUNT(*)::int AS "appointmentCount",
              COUNT(*) FILTER (WHERE s.status = 'COMPLETED')::int AS "completedCount",
              COUNT(*) FILTER (WHERE s.status = 'NO_SHOW')::int AS "noShowCount",
              COUNT(*) FILTER (
                WHERE o.outcome = 'CANCELLED'
                  AND o.occurred_at >= s."startAt" - INTERVAL '24 hours'
              )::int AS "lateCancellationCount",
              COUNT(*) FILTER (WHERE e.confirmation_status = 'CONFIRMED')::int AS "confirmedCount",
              COUNT(e.appointment_id)::int AS "confirmationTrackedCount"
       FROM scoped s
       JOIN customers c ON c.id = s."customerId"
       LEFT JOIN operations_appointment_outcomes o
         ON o.appointment_id = s.id AND o.tenant_id = $1 AND o.company_id = $2 AND o.branch_id = $3
       LEFT JOIN operations_appointment_engagement e
         ON e.appointment_id = s.id AND e.tenant_id = $1 AND e.company_id = $2 AND e.branch_id = $3
       GROUP BY s."customerId", c."firstName", c."lastName"
       ORDER BY "noShowCount" DESC, "lateCancellationCount" DESC, "appointmentCount" DESC
       LIMIT 100`,
      tenantId,
      companyId,
      branchId,
      safeDays,
    );

    const row = totals[0] ?? {
      totalAppointments: 0,
      completedAppointments: 0,
      noShows: 0,
      cancellations: 0,
      lateCancellations: 0,
      engagementRecords: 0,
      confirmed: 0,
      rescheduleRequests: 0,
      cancelRequests: 0,
    };
    const attendanceDenominator = Math.max(
      row.completedAppointments + row.noShows,
      0,
    );

    return {
      windowDays: safeDays,
      ...row,
      attendanceRate:
        attendanceDenominator > 0
          ? Number(
              ((row.completedAppointments / attendanceDenominator) * 100).toFixed(1),
            )
          : null,
      confirmationRate:
        row.engagementRecords > 0
          ? Number(((row.confirmed / row.engagementRecords) * 100).toFixed(1))
          : null,
      punitiveAutomationEnabled: false,
      customers: byCustomer.map((customer) => ({
        ...customer,
        attendanceRate:
          customer.completedCount + customer.noShowCount > 0
            ? Number(
                (
                  (customer.completedCount /
                    (customer.completedCount + customer.noShowCount)) *
                  100
                ).toFixed(1),
              )
            : null,
        confirmationRate:
          customer.confirmationTrackedCount > 0
            ? Number(
                (
                  (customer.confirmedCount /
                    customer.confirmationTrackedCount) *
                  100
                ).toFixed(1),
              )
            : null,
      })),
    };
  }
}
