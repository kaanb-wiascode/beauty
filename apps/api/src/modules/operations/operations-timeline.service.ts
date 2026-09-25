import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

type TimelineEvent = {
  occurredAt: Date;
  source: string;
  type: string;
  title: string;
  detail: string | null;
  appointmentId: string | null;
  visitId: string | null;
  executionId: string | null;
};

@Injectable()
export class OperationsTimelineService {
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

  async forAppointment(appointmentId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId, branchId },
      select: {
        id: true,
        createdAt: true,
        startAt: true,
        endAt: true,
        status: true,
        payment: { select: { id: true, paidAt: true } },
        session: { select: { id: true, status: true } },
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    const rows = await this.prisma.$queryRawUnsafe<TimelineEvent[]>(
      `WITH linked_visits AS (
         SELECT v.id
         FROM visits v
         JOIN visit_appointments va ON va."visitId" = v.id
         WHERE va."appointmentId" = $1
           AND v."tenantId" = $2 AND v."companyId" = $3 AND v."branchId" = $4
       )
       SELECT ve."createdAt" AS "occurredAt", 'VISIT'::text AS source,
              ve."eventType"::text AS type,
              replace(initcap(replace(ve."eventType", '_', ' ')), ' ', ' ') AS title,
              ve.note AS detail, $1::text AS "appointmentId", ve."visitId" AS "visitId",
              NULL::text AS "executionId"
       FROM visit_events ve
       JOIN linked_visits lv ON lv.id = ve."visitId"
       WHERE ve."tenantId" = $2 AND ve."branchId" = $4
       UNION ALL
       SELECT ee.created_at AS "occurredAt", 'SERVICE_EXECUTION'::text AS source,
              ee.event_type AS type,
              replace(initcap(replace(ee.event_type, '_', ' ')), ' ', ' ') AS title,
              ee.note AS detail, se.appointment_id AS "appointmentId", se.visit_id AS "visitId",
              ee.execution_id AS "executionId"
       FROM operations_service_execution_events ee
       JOIN operations_service_executions se ON se.id = ee.execution_id
       WHERE se.appointment_id = $1 AND se.tenant_id = $2
         AND se.company_id = $3 AND se.branch_id = $4
       UNION ALL
       SELECT o.occurred_at AS "occurredAt", 'APPOINTMENT_OUTCOME'::text AS source,
              o.outcome AS type,
              CASE WHEN o.outcome = 'NO_SHOW' THEN 'No-show' ELSE 'Randevu iptal edildi' END AS title,
              concat_ws(' · ', o.reason_label_snapshot, NULLIF(o.note, '')) AS detail,
              o.appointment_id AS "appointmentId", NULL::text AS "visitId", NULL::text AS "executionId"
       FROM operations_appointment_outcomes o
       WHERE o.appointment_id = $1 AND o.tenant_id = $2
         AND o.company_id = $3 AND o.branch_id = $4
       UNION ALL
       SELECT e.updated_at AS "occurredAt", 'ENGAGEMENT'::text AS source,
              e.confirmation_status AS type,
              CASE e.confirmation_status
                WHEN 'CONFIRMED' THEN 'Müşteri onayladı'
                WHEN 'RESCHEDULE_REQUESTED' THEN 'Tarih değişikliği istendi'
                WHEN 'CANCEL_REQUESTED' THEN 'İptal talebi alındı'
                ELSE 'Randevu iletişim durumu güncellendi'
              END AS title,
              NULL::text AS detail, e.appointment_id AS "appointmentId",
              NULL::text AS "visitId", NULL::text AS "executionId"
       FROM operations_appointment_engagement e
       WHERE e.appointment_id = $1 AND e.tenant_id = $2
         AND e.company_id = $3 AND e.branch_id = $4
       ORDER BY "occurredAt" ASC`,
      appointmentId,
      tenantId,
      companyId,
      branchId,
    );

    const events: TimelineEvent[] = [
      {
        occurredAt: appointment.createdAt,
        source: 'APPOINTMENT',
        type: 'CREATED',
        title: 'Randevu oluşturuldu',
        detail: null,
        appointmentId,
        visitId: null,
        executionId: null,
      },
      ...rows,
    ];

    if (appointment.payment?.paidAt) {
      events.push({
        occurredAt: appointment.payment.paidAt,
        source: 'PAYMENT',
        type: 'PAYMENT_COMPLETED',
        title: 'Ödeme tamamlandı',
        detail: null,
        appointmentId,
        visitId: null,
        executionId: null,
      });
    }

    events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    return {
      appointmentId,
      currentStatus: appointment.status,
      packageSessionStatus: appointment.session?.status ?? null,
      events,
    };
  }
}
