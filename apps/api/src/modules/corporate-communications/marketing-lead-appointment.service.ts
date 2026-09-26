import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import type { CreateMarketingAppointmentInput } from './corporate-communications.schemas';

type MarketingLeadAppointmentRow = {
  id: string;
  branchId: string | null;
  crmLeadId: string | null;
  customerId: string | null;
  appointmentId: string | null;
};

@Injectable()
export class MarketingLeadAppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return this.tenantContext.getContext();
  }

  async createAppointment(
    marketingLeadId: string,
    input: CreateMarketingAppointmentInput,
    actorUserId: string,
  ) {
    const context = this.context();
    const activeBranchId = context.branchId;
    if (!activeBranchId) {
      throw new BadRequestException(
        'Marketing appointment requires an active branch.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const [lead] = await tx.$queryRawUnsafe<MarketingLeadAppointmentRow[]>(
          `SELECT id,branch_id AS "branchId",crm_lead_id AS "crmLeadId",
                  customer_id AS "customerId",appointment_id AS "appointmentId"
           FROM corporate_marketing_leads
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND branch_id=$4::text
           FOR UPDATE`,
          marketingLeadId,
          context.tenantId,
          context.companyId,
          activeBranchId,
        );

        if (!lead) throw new NotFoundException('Marketing lead not found.');
        if (lead.appointmentId) {
          return {
            appointmentId: lead.appointmentId,
            customerId: lead.customerId,
            idempotent: true,
          };
        }
        if (!lead.customerId) {
          throw new BadRequestException(
            'Marketing lead must be linked to a customer before appointment creation.',
          );
        }

        const [customer, staff, service] = await Promise.all([
          tx.customer.findFirst({
            where: {
              id: lead.customerId,
              tenantId: context.tenantId,
              branchId: activeBranchId,
            },
            select: { id: true },
          }),
          tx.staff.findFirst({
            where: {
              id: input.staffId,
              tenantId: context.tenantId,
              branchId: activeBranchId,
            },
            select: { id: true, status: true },
          }),
          tx.service.findFirst({
            where: {
              id: input.serviceId,
              tenantId: context.tenantId,
              branchId: activeBranchId,
            },
            select: { id: true, status: true },
          }),
        ]);

        if (!customer) throw new NotFoundException('Customer not found.');
        if (!staff) throw new NotFoundException('Staff not found.');
        if (!service) throw new NotFoundException('Service not found.');
        if (staff.status !== 'ACTIVE') {
          throw new BadRequestException('Staff is not active.');
        }
        if (service.status !== 'ACTIVE') {
          throw new BadRequestException('Service is not active.');
        }

        await tx.$queryRawUnsafe<Array<{ locked: number }>>(
          `SELECT 1::int AS locked
           FROM (
             SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))
           ) AS advisory_lock`,
          `${context.tenantId}:${activeBranchId}`,
          input.staffId,
        );

        const overlapping = await tx.appointment.findFirst({
          where: {
            tenantId: context.tenantId,
            branchId: activeBranchId,
            staffId: input.staffId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            startAt: { lt: input.endAt },
            endAt: { gt: input.startAt },
          },
          select: { id: true },
        });
        if (overlapping) {
          throw new ConflictException(
            'Staff already has an overlapping appointment.',
          );
        }

        if (input.sessionId) {
          const session = await tx.session.findFirst({
            where: {
              id: input.sessionId,
              tenantId: context.tenantId,
              branchId: activeBranchId,
              serviceId: input.serviceId,
              status: 'AVAILABLE',
              appointmentId: null,
              customerPackage: {
                customerId: lead.customerId,
                status: 'ACTIVE',
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
            },
            select: { id: true },
          });
          if (!session) {
            throw new BadRequestException(
              'Selected session is not available for this customer, service, or branch.',
            );
          }
        }

        const appointment = await tx.appointment.create({
          data: {
            tenantId: context.tenantId,
            branchId: activeBranchId,
            customerId: lead.customerId,
            staffId: input.staffId,
            serviceId: input.serviceId,
            startAt: input.startAt,
            endAt: input.endAt,
            notes: input.notes?.trim() || null,
          },
          select: {
            id: true,
            customerId: true,
            staffId: true,
            serviceId: true,
            startAt: true,
            endAt: true,
          },
        });

        if (input.sessionId) {
          const reserved = await tx.session.updateMany({
            where: {
              id: input.sessionId,
              tenantId: context.tenantId,
              branchId: activeBranchId,
              status: 'AVAILABLE',
              appointmentId: null,
            },
            data: {
              status: 'RESERVED',
              appointmentId: appointment.id,
            },
          });
          if (reserved.count !== 1) {
            throw new ConflictException(
              'Selected session was reserved by another operation. Please choose another session.',
            );
          }
        }

        await tx.$executeRawUnsafe(
          `UPDATE corporate_marketing_leads
           SET appointment_id=$1::text,status='APPOINTMENT',updated_at=now()
           WHERE id=$2::text`,
          appointment.id,
          lead.id,
        );

        if (lead.crmLeadId) {
          await tx.$executeRawUnsafe(
            `INSERT INTO crm_events(
               tenant_id,company_id,branch_id,lead_id,event_type,actor_user_id,metadata
             ) VALUES($1::text,$2::text,$3::text,$4::text,'MARKETING_APPOINTMENT_CREATED',$5::text,$6::jsonb)`,
            context.tenantId,
            context.companyId,
            activeBranchId,
            lead.crmLeadId,
            actorUserId,
            JSON.stringify({
              marketingLeadId: lead.id,
              appointmentId: appointment.id,
              serviceId: input.serviceId,
              staffId: input.staffId,
              startAt: input.startAt.toISOString(),
              endAt: input.endAt.toISOString(),
            }),
          );
        }

        return {
          ...appointment,
          idempotent: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
