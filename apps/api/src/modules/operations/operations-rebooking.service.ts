import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import type {
  CreateRebookingInput,
  UpsertRebookingPolicyInput,
} from './dto/rebooking.dto';

type SourceAppointment = {
  id: string;
  customerId: string;
  serviceId: string;
  staffId: string;
  startAt: Date;
  endAt: Date;
  status: string;
  durationMinutes: number;
  serviceName: string;
  customerName: string;
  staffName: string;
  recommendedIntervalDays: number | null;
};

@Injectable()
export class OperationsRebookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();
    const membershipId = this.tenantContext.getMembershipId();
    if (!tenantId || !companyId || !membershipId) {
      throw new InternalServerErrorException('Organization context is incomplete.');
    }
    if (!branchId) {
      throw new BadRequestException('A branch must be selected for this operation.');
    }
    return { tenantId, companyId, branchId, membershipId };
  }

  async listOpportunities() {
    const { tenantId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<
      Array<
        SourceAppointment & {
          targetAppointmentId: string | null;
          targetStartAt: Date | null;
        }
      >
    >(
      `SELECT a.id,
              a."customerId" AS "customerId",
              a."serviceId" AS "serviceId",
              a."staffId" AS "staffId",
              a."startAt" AS "startAt",
              a."endAt" AS "endAt",
              a.status::text AS status,
              s."durationMinutes" AS "durationMinutes",
              s.name AS "serviceName",
              trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
              trim(concat(st."firstName", ' ', st."lastName")) AS "staffName",
              sor.recommended_rebooking_interval_days AS "recommendedIntervalDays",
              rb.target_appointment_id AS "targetAppointmentId",
              ta."startAt" AS "targetStartAt"
       FROM appointments a
       JOIN services s ON s.id = a."serviceId"
       JOIN customers c ON c.id = a."customerId"
       JOIN staff st ON st.id = a."staffId"
       LEFT JOIN service_operational_requirements sor
         ON sor.service_id = a."serviceId"
        AND sor.tenant_id = a."tenantId"
        AND sor.branch_id = a."branchId"
       LEFT JOIN operations_rebookings rb
         ON rb.source_appointment_id = a.id
        AND rb.tenant_id = a."tenantId"
        AND rb.branch_id = a."branchId"
       LEFT JOIN appointments ta ON ta.id = rb.target_appointment_id
       WHERE a."tenantId" = $1 AND a."branchId" = $2
         AND a.status::text = 'COMPLETED'
         AND a."endAt" >= CURRENT_TIMESTAMP - INTERVAL '90 days'
       ORDER BY a."endAt" DESC
       LIMIT 100`,
      tenantId,
      branchId,
    );

    return rows.map((row) => ({
      ...row,
      recommendedStartAt: row.recommendedIntervalDays
        ? new Date(
            row.endAt.getTime() + row.recommendedIntervalDays * 24 * 60 * 60 * 1000,
          )
        : null,
      rebooked: Boolean(row.targetAppointmentId),
    }));
  }

  async getRecommendation(sourceAppointmentId: string) {
    const { tenantId, branchId } = this.context();
    const source = await this.requireSource(
      this.prisma,
      sourceAppointmentId,
      tenantId,
      branchId,
    );
    if (source.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Only a completed appointment can produce a next-appointment recommendation.',
      );
    }

    const recommendedStartAt = source.recommendedIntervalDays
      ? new Date(
          source.endAt.getTime() +
            source.recommendedIntervalDays * 24 * 60 * 60 * 1000,
        )
      : null;

    return {
      sourceAppointmentId: source.id,
      customerId: source.customerId,
      customerName: source.customerName,
      serviceId: source.serviceId,
      serviceName: source.serviceName,
      preferredStaffId: source.staffId,
      preferredStaffName: source.staffName,
      durationMinutes: source.durationMinutes,
      recommendedIntervalDays: source.recommendedIntervalDays,
      recommendedStartAt,
      recommendationConfigured: source.recommendedIntervalDays !== null,
    };
  }

  async upsertServicePolicy(
    serviceId: string,
    input: UpsertRebookingPolicyInput,
  ) {
    const { tenantId, branchId } = this.context();
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, tenantId, branchId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!service) throw new NotFoundException('Service not found');

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ serviceId: string; recommendedIntervalDays: number | null }>
    >(
      `INSERT INTO service_operational_requirements (
         service_id, tenant_id, branch_id, recommended_rebooking_interval_days
       ) VALUES ($1,$2,$3,$4)
       ON CONFLICT (service_id) DO UPDATE SET
         recommended_rebooking_interval_days = EXCLUDED.recommended_rebooking_interval_days,
         updated_at = CURRENT_TIMESTAMP
       RETURNING service_id AS "serviceId",
                 recommended_rebooking_interval_days AS "recommendedIntervalDays"`,
      serviceId,
      tenantId,
      branchId,
      input.recommendedIntervalDays,
    );
    return rows[0];
  }

  async create(sourceAppointmentId: string, input: CreateRebookingInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    if (input.startAt <= new Date()) {
      throw new BadRequestException('Rebooking start time must be in the future.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) SELECT 1 FROM _advisory_lock`,
          `${tenantId}:${branchId}`,
          `rebooking:${sourceAppointmentId}`,
        );

        const existing = await tx.$queryRawUnsafe<
          Array<{ id: string; targetAppointmentId: string }>
        >(
          `SELECT id, target_appointment_id AS "targetAppointmentId"
           FROM operations_rebookings
           WHERE source_appointment_id = $1 AND tenant_id = $2 AND branch_id = $3
           LIMIT 1`,
          sourceAppointmentId,
          tenantId,
          branchId,
        );
        if (existing[0]) {
          const appointment = await tx.appointment.findUnique({
            where: { id: existing[0].targetAppointmentId },
          });
          return { rebookingId: existing[0].id, appointment, idempotent: true };
        }

        const source = await this.requireSource(
          tx,
          sourceAppointmentId,
          tenantId,
          branchId,
        );
        if (source.status !== 'COMPLETED') {
          throw new BadRequestException(
            'Only a completed appointment can be rebooked from checkout.',
          );
        }

        const staffId = input.staffId ?? source.staffId;
        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) SELECT 1 FROM _advisory_lock`,
          `${tenantId}:${branchId}`,
          staffId,
        );

        const staff = await tx.staff.findFirst({
          where: { id: staffId, tenantId, branchId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!staff) {
          throw new BadRequestException('Selected staff is not active in this branch.');
        }

        const endAt = new Date(
          input.startAt.getTime() + source.durationMinutes * 60 * 1000,
        );
        const overlap = await tx.appointment.findFirst({
          where: {
            tenantId,
            branchId,
            staffId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            startAt: { lt: endAt },
            endAt: { gt: input.startAt },
          },
          select: { id: true },
        });
        if (overlap) {
          throw new ConflictException('Staff already has an overlapping appointment.');
        }

        const leave = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM leave_requests
           WHERE tenant_id = $1 AND branch_id = $2 AND staff_id = $3
             AND upper(status) = 'APPROVED'
             AND start_date <= ($5::timestamptz AT TIME ZONE 'UTC')::date
             AND end_date >= ($4::timestamptz AT TIME ZONE 'UTC')::date
           LIMIT 1`,
          tenantId,
          branchId,
          staffId,
          input.startAt,
          endAt,
        );
        if (leave[0]) {
          throw new ConflictException('Selected staff is on approved leave for this slot.');
        }

        const appointment = await tx.appointment.create({
          data: {
            tenantId,
            branchId,
            customerId: source.customerId,
            serviceId: source.serviceId,
            staffId,
            startAt: input.startAt,
            endAt,
            notes: input.notes?.trim() || `Rebooked from appointment ${source.id}`,
          },
        });

        const recommendedStartAt = source.recommendedIntervalDays
          ? new Date(
              source.endAt.getTime() +
                source.recommendedIntervalDays * 24 * 60 * 60 * 1000,
            )
          : null;
        const rows = await tx.$queryRawUnsafe<
          Array<{ id: string }>
        >(
          `INSERT INTO operations_rebookings (
             tenant_id, company_id, branch_id, customer_id, service_id,
             source_appointment_id, target_appointment_id,
             source_staff_id, target_staff_id,
             recommended_interval_days, recommended_start_at, actual_start_at,
             created_by_membership_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING id`,
          tenantId,
          companyId,
          branchId,
          source.customerId,
          source.serviceId,
          source.id,
          appointment.id,
          source.staffId,
          staffId,
          source.recommendedIntervalDays,
          recommendedStartAt,
          input.startAt,
          membershipId,
        );

        return {
          rebookingId: rows[0]?.id,
          appointment,
          recommendedStartAt,
          actualStartAt: input.startAt,
          idempotent: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async requireSource(
    db: Pick<Prisma.TransactionClient, '$queryRawUnsafe'> | PrismaService,
    appointmentId: string,
    tenantId: string,
    branchId: string,
  ) {
    const rows = await db.$queryRawUnsafe<SourceAppointment[]>(
      `SELECT a.id,
              a."customerId" AS "customerId",
              a."serviceId" AS "serviceId",
              a."staffId" AS "staffId",
              a."startAt" AS "startAt",
              a."endAt" AS "endAt",
              a.status::text AS status,
              s."durationMinutes" AS "durationMinutes",
              s.name AS "serviceName",
              trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
              trim(concat(st."firstName", ' ', st."lastName")) AS "staffName",
              sor.recommended_rebooking_interval_days AS "recommendedIntervalDays"
       FROM appointments a
       JOIN services s ON s.id = a."serviceId"
       JOIN customers c ON c.id = a."customerId"
       JOIN staff st ON st.id = a."staffId"
       LEFT JOIN service_operational_requirements sor
         ON sor.service_id = a."serviceId"
        AND sor.tenant_id = a."tenantId"
        AND sor.branch_id = a."branchId"
       WHERE a.id = $1 AND a."tenantId" = $2 AND a."branchId" = $3
       LIMIT 1`,
      appointmentId,
      tenantId,
      branchId,
    );
    if (!rows[0]) throw new NotFoundException('Source appointment not found');
    return rows[0];
  }
}
