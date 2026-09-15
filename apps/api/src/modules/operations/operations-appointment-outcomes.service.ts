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
  CreateCancellationReasonInput,
  RecordAppointmentOutcomeInput,
} from './dto/appointment-outcome.dto';

@Injectable()
export class OperationsAppointmentOutcomesService {
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
    if (!branchId) throw new BadRequestException('A branch must be selected for this operation.');
    return { tenantId, companyId, branchId, membershipId };
  }

  async listReasons(outcome?: 'CANCELLED' | 'NO_SHOW') {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<
      Array<{ id: string; code: string; label: string; appliesTo: string; branchId: string | null; sortOrder: number }>
    >(
      `SELECT id, code, label, applies_to AS "appliesTo", branch_id AS "branchId", sort_order AS "sortOrder"
       FROM operations_cancellation_reasons
       WHERE tenant_id = $1 AND company_id = $2 AND active = TRUE
         AND (branch_id IS NULL OR branch_id = $3)
         AND ($4::text IS NULL OR applies_to = 'BOTH' OR applies_to = $4)
       ORDER BY CASE WHEN branch_id = $3 THEN 0 ELSE 1 END, sort_order, label`,
      tenantId,
      companyId,
      branchId,
      outcome ?? null,
    );
  }

  async createReason(input: CreateCancellationReasonInput) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; code: string; label: string; appliesTo: string; branchId: string | null; sortOrder: number }>
    >(
      `INSERT INTO operations_cancellation_reasons
         (tenant_id, company_id, branch_id, code, label, applies_to, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id, company_id, branch_id, code)
       DO UPDATE SET label = EXCLUDED.label, applies_to = EXCLUDED.applies_to,
                     sort_order = EXCLUDED.sort_order, active = TRUE, updated_at = CURRENT_TIMESTAMP
       RETURNING id, code, label, applies_to AS "appliesTo", branch_id AS "branchId", sort_order AS "sortOrder"`,
      tenantId,
      companyId,
      input.branchSpecific ? branchId : null,
      input.code,
      input.label,
      input.appliesTo,
      input.sortOrder,
    );
    return rows[0];
  }

  async record(appointmentId: string, input: RecordAppointmentOutcomeInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
          `${tenantId}:${branchId}`,
          `appointment-outcome:${appointmentId}`,
        );

        const existing = await tx.$queryRawUnsafe<
          Array<{ id: string; appointmentId: string; outcome: string; reasonCode: string; reasonLabel: string; note: string | null; occurredAt: Date }>
        >(
          `SELECT id, appointment_id AS "appointmentId", outcome,
                  reason_code_snapshot AS "reasonCode", reason_label_snapshot AS "reasonLabel",
                  note, occurred_at AS "occurredAt"
           FROM operations_appointment_outcomes
           WHERE appointment_id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
           LIMIT 1`,
          appointmentId,
          tenantId,
          companyId,
          branchId,
        );
        if (existing[0]) {
          if (existing[0].outcome !== input.outcome || existing[0].reasonCode === '') {
            throw new ConflictException('Appointment already has a terminal operational outcome.');
          }
          return existing[0];
        }

        const appointment = await tx.appointment.findFirst({
          where: { id: appointmentId, tenantId, branchId },
          include: { session: true },
        });
        if (!appointment) throw new NotFoundException('Appointment not found');
        if (appointment.status === 'COMPLETED') {
          throw new ConflictException('Completed appointment cannot be cancelled or marked no-show.');
        }
        if (['CANCELLED', 'NO_SHOW'].includes(appointment.status)) {
          throw new ConflictException('Appointment is already in a terminal cancellation state.');
        }

        const reasons = await tx.$queryRawUnsafe<
          Array<{ id: string; code: string; label: string; appliesTo: string }>
        >(
          `SELECT id, code, label, applies_to AS "appliesTo"
           FROM operations_cancellation_reasons
           WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND active = TRUE
             AND (branch_id IS NULL OR branch_id = $4)
           LIMIT 1`,
          input.reasonId,
          tenantId,
          companyId,
          branchId,
        );
        const reason = reasons[0];
        if (!reason) throw new BadRequestException('Cancellation/no-show reason is not valid for the active branch.');
        if (reason.appliesTo !== 'BOTH' && reason.appliesTo !== input.outcome) {
          throw new BadRequestException('Selected reason does not apply to this outcome.');
        }

        if (appointment.session?.status === 'RESERVED') {
          const released = await tx.session.updateMany({
            where: {
              id: appointment.session.id,
              tenantId,
              branchId,
              status: 'RESERVED',
              appointmentId,
            },
            data: { status: 'AVAILABLE', appointmentId: null },
          });
          if (released.count !== 1) {
            throw new ConflictException('Reserved package session changed during outcome processing.');
          }
        }

        await tx.appointment.update({
          where: { id: appointmentId },
          data: { status: input.outcome },
        });

        const rows = await tx.$queryRawUnsafe<
          Array<{ id: string; appointmentId: string; outcome: string; reasonCode: string; reasonLabel: string; note: string | null; occurredAt: Date }>
        >(
          `INSERT INTO operations_appointment_outcomes
             (tenant_id, company_id, branch_id, appointment_id, outcome, reason_id,
              reason_code_snapshot, reason_label_snapshot, note, actor_membership_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id, appointment_id AS "appointmentId", outcome,
                     reason_code_snapshot AS "reasonCode", reason_label_snapshot AS "reasonLabel",
                     note, occurred_at AS "occurredAt"`,
          tenantId,
          companyId,
          branchId,
          appointmentId,
          input.outcome,
          reason.id,
          reason.code,
          reason.label,
          input.note ?? null,
          membershipId,
        );
        return rows[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listRecent(limit = 100) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe(
      `SELECT o.id, o.appointment_id AS "appointmentId", o.outcome,
              o.reason_code_snapshot AS "reasonCode", o.reason_label_snapshot AS "reasonLabel",
              o.note, o.occurred_at AS "occurredAt",
              trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
              s.name AS "serviceName"
       FROM operations_appointment_outcomes o
       JOIN appointments a ON a.id = o.appointment_id
       JOIN customers c ON c.id = a."customerId"
       JOIN services s ON s.id = a."serviceId"
       WHERE o.tenant_id = $1 AND o.company_id = $2 AND o.branch_id = $3
       ORDER BY o.occurred_at DESC
       LIMIT $4`,
      tenantId,
      companyId,
      branchId,
      Math.min(Math.max(limit, 1), 200),
    );
  }
}
