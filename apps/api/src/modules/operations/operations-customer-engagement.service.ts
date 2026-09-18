import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import { CrmMessageService } from '../crm/crm-message.service';
import type {
  SendAppointmentReminderInput,
  SendCheckoutFollowupInput,
  UpdateAppointmentConfirmationInput,
} from './dto/customer-engagement.dto';

type AppointmentEngagementTarget = {
  id: string;
  customerId: string;
  status: string;
  startAt: Date;
  customerName: string;
  serviceName: string;
  staffName: string;
};

@Injectable()
export class OperationsCustomerEngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly crmMessages: CrmMessageService,
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

  async listUpcoming(days = 7) {
    const { tenantId, companyId, branchId } = this.context();
    const safeDays = Math.min(Math.max(days, 1), 31);
    return this.prisma.$queryRawUnsafe(
      `SELECT a.id,
              a."customerId" AS "customerId",
              a."startAt" AS "startAt",
              a.status::text AS "appointmentStatus",
              trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
              s.name AS "serviceName",
              trim(concat(st."firstName", ' ', st."lastName")) AS "staffName",
              COALESCE(e.confirmation_status, 'PENDING') AS "confirmationStatus",
              e.confirmation_note AS "confirmationNote",
              e.last_reminder_message_id AS "lastReminderMessageId",
              e.last_reminder_sent_at AS "lastReminderSentAt",
              COALESCE(e.version, 1) AS version
       FROM appointments a
       JOIN customers c ON c.id=a."customerId"
       JOIN services s ON s.id=a."serviceId"
       JOIN staff st ON st.id=a."staffId"
       LEFT JOIN operations_appointment_engagement e
         ON e.appointment_id=a.id AND e.tenant_id=$1 AND e.company_id=$2 AND e.branch_id=$3
       WHERE a."tenantId"=$1 AND a."branchId"=$3
         AND a.status::text IN ('SCHEDULED','CONFIRMED')
         AND a."startAt" >= NOW()
         AND a."startAt" < NOW() + ($4::int * INTERVAL '1 day')
       ORDER BY a."startAt" ASC`,
      tenantId,
      companyId,
      branchId,
      safeDays,
    );
  }

  async sendAppointmentReminder(appointmentId: string, input: SendAppointmentReminderInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    const target = await this.requireAppointment(appointmentId, tenantId, branchId);
    if (!['SCHEDULED', 'CONFIRMED'].includes(target.status)) {
      throw new BadRequestException('Only active upcoming appointments can receive reminders.');
    }
    const actorUserId = await this.actorUserId(membershipId, tenantId);
    const body = input.body?.trim() ||
      `Merhaba ${target.customerName}, ${target.serviceName} randevunuzu hatırlatmak isteriz. Randevu zamanı: ${target.startAt.toISOString()}. Değişiklik için bizimle iletişime geçebilirsiniz.`;
    const key = `OPS_APPOINTMENT_REMINDER:${appointmentId}:${target.startAt.toISOString()}:${input.channel}`;
    const draft = await this.crmMessages.createDraft(
      {
        customerId: target.customerId,
        channel: input.channel,
        body,
        idempotencyKey: key,
      },
      actorUserId,
    );
    const message = ['DRAFT', 'FAILED'].includes(draft.status)
      ? await this.crmMessages.send(draft.id, draft.version)
      : draft;

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO operations_appointment_engagement (
         appointment_id,tenant_id,company_id,branch_id,last_reminder_message_id,last_reminder_sent_at
       ) VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (appointment_id) DO UPDATE SET
         last_reminder_message_id=EXCLUDED.last_reminder_message_id,
         last_reminder_sent_at=NOW(),
         version=operations_appointment_engagement.version+1,
         updated_at=NOW()`,
      appointmentId,
      tenantId,
      companyId,
      branchId,
      message.id,
    );
    return { appointmentId, messageId: message.id, messageStatus: message.status, idempotencyKey: key };
  }

  async updateConfirmation(appointmentId: string, input: UpdateAppointmentConfirmationInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    await this.requireAppointment(appointmentId, tenantId, branchId);

    const rows = await this.prisma.$queryRawUnsafe<Array<{ version: number }>>(
      `INSERT INTO operations_appointment_engagement (
         appointment_id,tenant_id,company_id,branch_id,confirmation_status,confirmation_note,
         confirmed_at,confirmation_updated_by_membership_id
       ) VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $5='CONFIRMED' THEN NOW() ELSE NULL END,$7)
       ON CONFLICT (appointment_id) DO UPDATE SET
         confirmation_status=EXCLUDED.confirmation_status,
         confirmation_note=EXCLUDED.confirmation_note,
         confirmed_at=CASE WHEN EXCLUDED.confirmation_status='CONFIRMED' THEN NOW() ELSE NULL END,
         confirmation_updated_by_membership_id=EXCLUDED.confirmation_updated_by_membership_id,
         version=operations_appointment_engagement.version+1,
         updated_at=NOW()
       WHERE ($8::int IS NULL OR operations_appointment_engagement.version=$8::int)
       RETURNING version`,
      appointmentId,
      tenantId,
      companyId,
      branchId,
      input.status,
      input.note?.trim() || null,
      membershipId,
      input.expectedVersion ?? null,
    );
    if (!rows[0]) throw new ConflictException('Confirmation state changed. Refresh and retry.');
    return { appointmentId, status: input.status, version: rows[0].version };
  }

  async sendCheckoutFollowup(visitId: string, input: SendCheckoutFollowupInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; customerId: string; customerName: string; status: string }>
    >(
      `SELECT v.id,v.customer_id AS "customerId",v.status,
              trim(concat(c."firstName", ' ', c."lastName")) AS "customerName"
       FROM visits v
       JOIN customers c ON c.id=v.customer_id
       WHERE v.id=$1 AND v.tenant_id=$2 AND v.company_id=$3 AND v.branch_id=$4
       LIMIT 1`,
      visitId,
      tenantId,
      companyId,
      branchId,
    );
    const visit = rows[0];
    if (!visit) throw new NotFoundException('Visit not found.');
    if (visit.status !== 'CHECKED_OUT') {
      throw new BadRequestException('Checkout follow-up can only be sent after checkout.');
    }
    const actorUserId = await this.actorUserId(membershipId, tenantId);
    const body = input.body?.trim() ||
      `Merhaba ${visit.customerName}, ziyaretiniz için teşekkür ederiz. Deneyiminizle ilgili geri bildiriminizi duymaktan memnuniyet duyarız. Bir sonraki randevunuz için bizimle iletişime geçebilirsiniz.`;
    const key = `OPS_CHECKOUT_FOLLOWUP:${visitId}:${input.channel}`;
    const draft = await this.crmMessages.createDraft(
      { customerId: visit.customerId, channel: input.channel, body, idempotencyKey: key },
      actorUserId,
    );
    const message = ['DRAFT', 'FAILED'].includes(draft.status)
      ? await this.crmMessages.send(draft.id, draft.version)
      : draft;

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO operations_checkout_followups (
         visit_id,tenant_id,company_id,branch_id,customer_id,crm_message_id,sent_at,created_by_membership_id
       ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)
       ON CONFLICT (visit_id) DO UPDATE SET crm_message_id=EXCLUDED.crm_message_id,sent_at=NOW()`,
      visitId,
      tenantId,
      companyId,
      branchId,
      visit.customerId,
      message.id,
      membershipId,
    );
    return { visitId, messageId: message.id, messageStatus: message.status, idempotencyKey: key };
  }

  private async actorUserId(membershipId: string, tenantId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      select: { userId: true },
    });
    if (!membership) throw new InternalServerErrorException('Membership actor could not be resolved.');
    return membership.userId;
  }

  private async requireAppointment(appointmentId: string, tenantId: string, branchId: string) {
    const rows = await this.prisma.$queryRawUnsafe<AppointmentEngagementTarget[]>(
      `SELECT a.id,a."customerId" AS "customerId",a.status::text AS status,a."startAt" AS "startAt",
              trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
              s.name AS "serviceName",trim(concat(st."firstName", ' ', st."lastName")) AS "staffName"
       FROM appointments a
       JOIN customers c ON c.id=a."customerId"
       JOIN services s ON s.id=a."serviceId"
       JOIN staff st ON st.id=a."staffId"
       WHERE a.id=$1 AND a."tenantId"=$2 AND a."branchId"=$3 LIMIT 1`,
      appointmentId,
      tenantId,
      branchId,
    );
    if (!rows[0]) throw new NotFoundException('Appointment not found.');
    return rows[0];
  }
}
