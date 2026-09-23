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
  CancelWaitlistEntryInput,
  CreateWaitlistEntryInput,
  ListWaitlistEntriesInput,
} from './dto/waitlist.dto';

type ReferenceClient = Pick<
  Prisma.TransactionClient,
  'customer' | 'staff' | 'service'
>;

type WaitlistRow = {
  id: string;
  customerId: string;
  serviceId: string;
  preferredStaffId: string | null;
  desiredFrom: Date;
  desiredTo: Date;
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
  timeZone: string;
  priority: number;
  contactChannel: 'ANY' | 'PHONE' | 'SMS' | 'WHATSAPP' | 'EMAIL';
  status:
    | 'WAITING'
    | 'MATCH_FOUND'
    | 'CONTACTED'
    | 'BOOKED'
    | 'EXPIRED'
    | 'CANCELLED';
  matchedSlotFrom: Date | null;
  matchedSlotTo: Date | null;
  bookedAppointmentId: string | null;
  note: string | null;
  expiresAt: Date | null;
  version: number;
  createdAt: Date;
};

@Injectable()
export class OperationsWaitlistService {
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
      throw new InternalServerErrorException(
        'Organization context is incomplete.',
      );
    }
    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }

    return { tenantId, companyId, branchId, membershipId };
  }

  async list(input: ListWaitlistEntriesInput) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<
      Array<
        WaitlistRow & {
          customerName: string;
          serviceName: string;
          preferredStaffName: string | null;
        }
      >
    >(
      `SELECT w.id, w.customer_id AS "customerId", w.service_id AS "serviceId",
              w.preferred_staff_id AS "preferredStaffId",
              w.desired_from AS "desiredFrom", w.desired_to AS "desiredTo",
              w.preferred_time_start::text AS "preferredTimeStart",
              w.preferred_time_end::text AS "preferredTimeEnd",
              w.time_zone AS "timeZone",
              w.priority, w.contact_channel AS "contactChannel",
              w.status, w.matched_slot_from AS "matchedSlotFrom",
              w.matched_slot_to AS "matchedSlotTo",
              w.booked_appointment_id AS "bookedAppointmentId",
              w.note, w.expires_at AS "expiresAt", w.version,
              w.created_at AS "createdAt",
              trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
              s.name AS "serviceName",
              CASE WHEN st.id IS NULL THEN NULL
                   ELSE trim(concat(st."firstName", ' ', st."lastName")) END AS "preferredStaffName"
       FROM operations_waitlist_entries w
       JOIN customers c ON c.id = w.customer_id
       JOIN services s ON s.id = w.service_id
       LEFT JOIN staff st ON st.id = w.preferred_staff_id
       WHERE w.tenant_id = $1 AND w.company_id = $2 AND w.branch_id = $3
         AND ($4::text IS NULL OR w.status::text = $4)
         AND ($5::text IS NULL OR w.service_id = $5)
         AND ($6::text IS NULL OR w.customer_id = $6)
         AND ($7::timestamptz IS NULL OR w.desired_to > $7)
         AND ($8::timestamptz IS NULL OR w.desired_from < $8)
       ORDER BY
         CASE WHEN w.status IN ('WAITING', 'MATCH_FOUND', 'CONTACTED') THEN 0 ELSE 1 END,
         w.priority DESC, w.created_at ASC`,
      tenantId,
      companyId,
      branchId,
      input.status ?? null,
      input.serviceId ?? null,
      input.customerId ?? null,
      input.from ?? null,
      input.to ?? null,
    );
  }

  async create(input: CreateWaitlistEntryInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    if (input.desiredTo <= new Date()) {
      throw new BadRequestException('Waitlist desired window must end in the future.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) SELECT 1 FROM _advisory_lock`,
          `${tenantId}:${branchId}`,
          `waitlist:${input.customerId}:${input.serviceId}`,
        );

        await this.validateReferences(
          tx,
          tenantId,
          branchId,
          input.customerId,
          input.serviceId,
          input.preferredStaffId ?? null,
        );

        const duplicate = await tx.$queryRawUnsafe<WaitlistRow[]>(
          `SELECT id, customer_id AS "customerId", service_id AS "serviceId",
                  preferred_staff_id AS "preferredStaffId",
                  desired_from AS "desiredFrom", desired_to AS "desiredTo",
                  preferred_time_start::text AS "preferredTimeStart",
                  preferred_time_end::text AS "preferredTimeEnd",
                  time_zone AS "timeZone",
                  priority, contact_channel AS "contactChannel", status,
                  matched_slot_from AS "matchedSlotFrom", matched_slot_to AS "matchedSlotTo",
                  booked_appointment_id AS "bookedAppointmentId", note,
                  expires_at AS "expiresAt", version, created_at AS "createdAt"
           FROM operations_waitlist_entries
           WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
             AND customer_id = $4 AND service_id = $5
             AND preferred_staff_id IS NOT DISTINCT FROM $6::text
             AND desired_from = $7 AND desired_to = $8
             AND preferred_time_start IS NOT DISTINCT FROM $9::time
             AND preferred_time_end IS NOT DISTINCT FROM $10::time
             AND time_zone = $11
             AND status IN ('WAITING', 'MATCH_FOUND', 'CONTACTED')
           LIMIT 1`,
          tenantId,
          companyId,
          branchId,
          input.customerId,
          input.serviceId,
          input.preferredStaffId ?? null,
          input.desiredFrom,
          input.desiredTo,
          input.preferredTimeStart ?? null,
          input.preferredTimeEnd ?? null,
          input.timeZone,
        );
        if (duplicate[0]) return { entry: duplicate[0], duplicate: true };

        const created = await tx.$queryRawUnsafe<WaitlistRow[]>(
          `INSERT INTO operations_waitlist_entries (
             tenant_id, company_id, branch_id, customer_id, service_id,
             preferred_staff_id, desired_from, desired_to,
             preferred_time_start, preferred_time_end, time_zone, priority,
             contact_channel, note, expires_at, created_by_membership_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING id, customer_id AS "customerId", service_id AS "serviceId",
                     preferred_staff_id AS "preferredStaffId",
                     desired_from AS "desiredFrom", desired_to AS "desiredTo",
                     preferred_time_start::text AS "preferredTimeStart",
                     preferred_time_end::text AS "preferredTimeEnd",
                     time_zone AS "timeZone",
                     priority, contact_channel AS "contactChannel", status,
                     matched_slot_from AS "matchedSlotFrom", matched_slot_to AS "matchedSlotTo",
                     booked_appointment_id AS "bookedAppointmentId", note,
                     expires_at AS "expiresAt", version, created_at AS "createdAt"`,
          tenantId,
          companyId,
          branchId,
          input.customerId,
          input.serviceId,
          input.preferredStaffId ?? null,
          input.desiredFrom,
          input.desiredTo,
          input.preferredTimeStart ?? null,
          input.preferredTimeEnd ?? null,
          input.timeZone,
          input.priority,
          input.contactChannel,
          input.note ?? null,
          input.expiresAt ?? null,
          membershipId,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_waitlist_events (
             waitlist_entry_id, tenant_id, branch_id, actor_membership_id,
             event_type, from_status, to_status, note
           ) VALUES ($1,$2,$3,$4,'WAITLIST_CREATED',NULL,'WAITING',$5)`,
          created[0].id,
          tenantId,
          branchId,
          membershipId,
          input.note ?? null,
        );

        return { entry: created[0], duplicate: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async cancel(entryId: string, input: CancelWaitlistEntryInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) SELECT 1 FROM _advisory_lock`,
          `${tenantId}:${branchId}`,
          `waitlist-entry:${entryId}`,
        );

        const current = await tx.$queryRawUnsafe<WaitlistRow[]>(
          `SELECT id, customer_id AS "customerId", service_id AS "serviceId",
                  preferred_staff_id AS "preferredStaffId",
                  desired_from AS "desiredFrom", desired_to AS "desiredTo",
                  preferred_time_start::text AS "preferredTimeStart",
                  preferred_time_end::text AS "preferredTimeEnd",
                  time_zone AS "timeZone",
                  priority, contact_channel AS "contactChannel", status,
                  matched_slot_from AS "matchedSlotFrom", matched_slot_to AS "matchedSlotTo",
                  booked_appointment_id AS "bookedAppointmentId", note,
                  expires_at AS "expiresAt", version, created_at AS "createdAt"
           FROM operations_waitlist_entries
           WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
           LIMIT 1`,
          entryId,
          tenantId,
          companyId,
          branchId,
        );
        if (!current[0]) throw new NotFoundException('Waitlist entry not found');
        if (current[0].version !== input.expectedVersion) {
          throw new ConflictException(
            'Waitlist entry changed since it was read. Refresh and retry.',
          );
        }
        if (['BOOKED', 'EXPIRED', 'CANCELLED'].includes(current[0].status)) {
          throw new ConflictException(
            `Waitlist entry in ${current[0].status} state cannot be cancelled.`,
          );
        }

        const updated = await tx.$queryRawUnsafe<WaitlistRow[]>(
          `UPDATE operations_waitlist_entries
           SET status = 'CANCELLED', note = COALESCE($5, note),
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
             AND version = $6
           RETURNING id, customer_id AS "customerId", service_id AS "serviceId",
                     preferred_staff_id AS "preferredStaffId",
                     desired_from AS "desiredFrom", desired_to AS "desiredTo",
                     preferred_time_start::text AS "preferredTimeStart",
                     preferred_time_end::text AS "preferredTimeEnd",
                     time_zone AS "timeZone",
                     priority, contact_channel AS "contactChannel", status,
                     matched_slot_from AS "matchedSlotFrom", matched_slot_to AS "matchedSlotTo",
                     booked_appointment_id AS "bookedAppointmentId", note,
                     expires_at AS "expiresAt", version, created_at AS "createdAt"`,
          entryId,
          tenantId,
          companyId,
          branchId,
          input.note ?? null,
          input.expectedVersion,
        );
        if (!updated[0]) {
          throw new ConflictException(
            'Waitlist entry changed during cancellation. Refresh and retry.',
          );
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_waitlist_events (
             waitlist_entry_id, tenant_id, branch_id, actor_membership_id,
             event_type, from_status, to_status, note
           ) VALUES ($1,$2,$3,$4,'WAITLIST_CANCELLED',$5,'CANCELLED',$6)`,
          entryId,
          tenantId,
          branchId,
          membershipId,
          current[0].status,
          input.note ?? null,
        );

        return updated[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async validateReferences(
    db: ReferenceClient,
    tenantId: string,
    branchId: string,
    customerId: string,
    serviceId: string,
    preferredStaffId: string | null,
  ) {
    const [customer, service, staff] = await Promise.all([
      db.customer.findFirst({
        where: { id: customerId, tenantId, branchId },
        select: { id: true },
      }),
      db.service.findFirst({
        where: { id: serviceId, tenantId, branchId, status: 'ACTIVE' },
        select: { id: true },
      }),
      preferredStaffId
        ? db.staff.findFirst({
            where: {
              id: preferredStaffId,
              tenantId,
              branchId,
              status: 'ACTIVE',
            },
            select: { id: true },
          })
        : Promise.resolve({ id: null }),
    ]);

    if (!customer) throw new NotFoundException('Customer not found');
    if (!service) throw new NotFoundException('Service not found');
    if (preferredStaffId && !staff) {
      throw new NotFoundException('Preferred staff not found');
    }
  }
}
