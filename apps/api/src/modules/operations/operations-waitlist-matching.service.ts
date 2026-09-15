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
  AcceptWaitlistMatchInput,
  FindWaitlistMatchesInput,
} from './dto/waitlist.dto';

type WaitlistTarget = {
  id: string;
  customerId: string;
  serviceId: string;
  preferredStaffId: string | null;
  desiredFrom: Date;
  desiredTo: Date;
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
  timeZone: string;
  status: string;
  expiresAt: Date | null;
  version: number;
  durationMinutes: number;
  roomType: string | null;
  requiredAssetType: string | null;
  requiredAssetId: string | null;
  prepDurationMinutes: number;
  cleanupDurationMinutes: number;
};

type WaitlistMatch = {
  staffId: string;
  staffName: string;
  startAt: Date;
  endAt: Date;
  blockedFrom: Date;
  blockedTo: Date;
  roomId: string | null;
  roomName: string | null;
  assetId: string | null;
  assetName: string | null;
};

@Injectable()
export class OperationsWaitlistMatchingService {
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

  async findMatches(entryId: string, input: FindWaitlistMatchesInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    const target = await this.requireTarget(
      this.prisma,
      entryId,
      tenantId,
      companyId,
      branchId,
    );
    this.assertMatchable(target);

    const scanFrom = this.ceilToQuarterHour(
      new Date(Math.max(Date.now(), target.desiredFrom.getTime())),
    );
    if (scanFrom >= target.desiredTo) {
      return { entryId, entryVersion: target.version, matches: [] as WaitlistMatch[] };
    }

    const matches = await this.prisma.$queryRawUnsafe<WaitlistMatch[]>(
      `WITH slots AS (
         SELECT gs AS start_at,
                gs + ($7::int * INTERVAL '1 minute') AS end_at,
                gs - ($8::int * INTERVAL '1 minute') AS blocked_from,
                gs + (($7::int + $9::int) * INTERVAL '1 minute') AS blocked_to
         FROM generate_series(
           $5::timestamptz,
           $6::timestamptz - ($7::int * INTERVAL '1 minute'),
           INTERVAL '15 minutes'
         ) gs
         WHERE ($10::time IS NULL OR (gs AT TIME ZONE $12)::time >= $10::time)
           AND ($11::time IS NULL OR ((gs + ($7::int * INTERVAL '1 minute')) AT TIME ZONE $12)::time <= $11::time)
       ), staff_candidates AS (
         SELECT st.id, trim(concat(st."firstName", ' ', st."lastName")) AS name
         FROM staff st
         WHERE st."tenantId" = $1 AND st."branchId" = $3 AND st.status::text = 'ACTIVE'
           AND ($4::text IS NULL OR st.id = $4)
       )
       SELECT sc.id AS "staffId", sc.name AS "staffName",
              sl.start_at AS "startAt", sl.end_at AS "endAt",
              sl.blocked_from AS "blockedFrom", sl.blocked_to AS "blockedTo",
              room.id AS "roomId", room.name AS "roomName",
              asset.id AS "assetId", asset.name AS "assetName"
       FROM slots sl
       CROSS JOIN staff_candidates sc
       LEFT JOIN LATERAL (
         SELECT r.id, r.name
         FROM operations_rooms r
         WHERE $13::text IS NOT NULL
           AND r.tenant_id = $1 AND r.company_id = $2 AND r.branch_id = $3
           AND r.status = 'AVAILABLE' AND r.room_type = $13
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_allocations ra
             WHERE ra.room_id = r.id AND ra.status = 'RESERVED'
               AND ra.blocked_from < sl.blocked_to AND ra.blocked_to > sl.blocked_from
           )
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_blocks rb
             WHERE rb.room_id = r.id AND rb.status = 'ACTIVE'
               AND rb.blocked_from < sl.blocked_to AND rb.blocked_to > sl.blocked_from
           )
         ORDER BY r.name ASC, r.id ASC
         LIMIT 1
       ) room ON TRUE
       LEFT JOIN LATERAL (
         SELECT a.id, a.name
         FROM inventory_assets a
         WHERE ($14::text IS NOT NULL OR $15::text IS NOT NULL)
           AND a.company_id = $2 AND a.status = 'ACTIVE'
           AND (a.branch_id = $3 OR a.branch_id IS NULL)
           AND ($15::text IS NULL OR a.id = $15)
           AND ($14::text IS NULL OR a.asset_type = $14)
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_allocations ra
             WHERE ra.inventory_asset_id = a.id AND ra.status = 'RESERVED'
               AND ra.blocked_from < sl.blocked_to AND ra.blocked_to > sl.blocked_from
           )
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_blocks rb
             WHERE rb.inventory_asset_id = a.id AND rb.status = 'ACTIVE'
               AND rb.blocked_from < sl.blocked_to AND rb.blocked_to > sl.blocked_from
           )
           AND NOT EXISTS (
             SELECT 1 FROM inventory_asset_maintenance m
             WHERE m.asset_id = a.id AND m.status IN ('PLANNED', 'IN_PROGRESS')
               AND m.completed_at IS NULL
               AND (m.scheduled_at IS NULL OR m.scheduled_at < sl.blocked_to)
           )
         ORDER BY CASE WHEN a.branch_id = $3 THEN 0 ELSE 1 END, a.name ASC, a.id ASC
         LIMIT 1
       ) asset ON TRUE
       WHERE NOT EXISTS (
         SELECT 1 FROM appointments ap
         WHERE ap."tenantId" = $1 AND ap."branchId" = $3 AND ap."staffId" = sc.id
           AND ap.status::text NOT IN ('CANCELLED', 'NO_SHOW')
           AND ap."startAt" < sl.end_at AND ap."endAt" > sl.start_at
       )
         AND ($13::text IS NULL OR room.id IS NOT NULL)
         AND (($14::text IS NULL AND $15::text IS NULL) OR asset.id IS NOT NULL)
       ORDER BY sl.start_at ASC, sc.name ASC
       LIMIT $16`,
      tenantId,
      companyId,
      branchId,
      target.preferredStaffId,
      scanFrom,
      target.desiredTo,
      target.durationMinutes,
      target.prepDurationMinutes,
      target.cleanupDurationMinutes,
      target.preferredTimeStart,
      target.preferredTimeEnd,
      target.timeZone,
      target.roomType,
      target.requiredAssetType,
      target.requiredAssetId,
      input.limit,
    );

    let entryVersion = target.version;
    if (matches[0] && target.status === 'WAITING') {
      const updated = await this.prisma.$queryRawUnsafe<Array<{ version: number }>>(
        `UPDATE operations_waitlist_entries
         SET status = 'MATCH_FOUND', matched_slot_from = $5, matched_slot_to = $6,
             version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
           AND status = 'WAITING' AND version = $7
         RETURNING version`,
        entryId,
        tenantId,
        companyId,
        branchId,
        matches[0].startAt,
        matches[0].endAt,
        target.version,
      );
      if (updated[0]) {
        entryVersion = updated[0].version;
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO operations_waitlist_events (
             waitlist_entry_id, tenant_id, branch_id, actor_membership_id,
             event_type, from_status, to_status, note
           ) VALUES ($1,$2,$3,$4,'MATCH_FOUND','WAITING','MATCH_FOUND',$5)`,
          entryId,
          tenantId,
          branchId,
          membershipId,
          `First compatible slot: ${matches[0].startAt.toISOString()}`,
        );
      }
    }

    return { entryId, entryVersion, matches };
  }

  async acceptMatch(entryId: string, input: AcceptWaitlistMatchInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
          `${tenantId}:${branchId}`,
          `waitlist-entry:${entryId}`,
        );
        await tx.$queryRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
          `${tenantId}:${branchId}`,
          input.staffId,
        );

        const target = await this.requireTarget(
          tx,
          entryId,
          tenantId,
          companyId,
          branchId,
        );
        this.assertMatchable(target);
        if (target.version !== input.expectedVersion) {
          throw new ConflictException(
            'Waitlist entry changed since the slot was matched. Refresh and retry.',
          );
        }
        this.assertRequestedSlot(target, input);

        const staff = await tx.staff.findFirst({
          where: {
            id: input.staffId,
            tenantId,
            branchId,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (!staff) throw new NotFoundException('Staff not found');
        if (target.preferredStaffId && target.preferredStaffId !== input.staffId) {
          throw new BadRequestException('Selected staff does not match the waitlist preference.');
        }

        const overlap = await tx.appointment.findFirst({
          where: {
            tenantId,
            branchId,
            staffId: input.staffId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            startAt: { lt: input.endAt },
            endAt: { gt: input.startAt },
          },
          select: { id: true },
        });
        if (overlap) {
          throw new ConflictException('Matched slot is no longer available for the selected staff.');
        }

        const blockedFrom = new Date(
          input.startAt.getTime() - target.prepDurationMinutes * 60_000,
        );
        const blockedTo = new Date(
          input.endAt.getTime() + target.cleanupDurationMinutes * 60_000,
        );

        await this.assertResourceSelection(tx, target, input, {
          tenantId,
          companyId,
          branchId,
          blockedFrom,
          blockedTo,
        });

        const appointment = await tx.appointment.create({
          data: {
            tenantId,
            branchId,
            customerId: target.customerId,
            staffId: input.staffId,
            serviceId: target.serviceId,
            startAt: input.startAt,
            endAt: input.endAt,
            notes: null,
          },
          select: { id: true, startAt: true, endAt: true, status: true },
        });

        if (input.roomId) {
          await this.insertAllocation(tx, {
            appointmentId: appointment.id,
            tenantId,
            companyId,
            branchId,
            membershipId,
            blockedFrom,
            blockedTo,
            roomId: input.roomId,
            assetId: null,
          });
        }
        if (input.assetId) {
          await this.insertAllocation(tx, {
            appointmentId: appointment.id,
            tenantId,
            companyId,
            branchId,
            membershipId,
            blockedFrom,
            blockedTo,
            roomId: null,
            assetId: input.assetId,
          });
        }

        const booked = await tx.$queryRawUnsafe<
          Array<{ id: string; status: string; version: number; bookedAppointmentId: string }>
        >(
          `UPDATE operations_waitlist_entries
           SET status = 'BOOKED', matched_slot_from = $5, matched_slot_to = $6,
               booked_appointment_id = $7, version = version + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
             AND version = $8 AND status IN ('WAITING','MATCH_FOUND','CONTACTED')
           RETURNING id, status, version, booked_appointment_id AS "bookedAppointmentId"`,
          entryId,
          tenantId,
          companyId,
          branchId,
          input.startAt,
          input.endAt,
          appointment.id,
          input.expectedVersion,
        );
        if (!booked[0]) {
          throw new ConflictException('Waitlist entry changed during slot acceptance.');
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_waitlist_events (
             waitlist_entry_id, tenant_id, branch_id, actor_membership_id,
             event_type, from_status, to_status, note
           ) VALUES ($1,$2,$3,$4,'WAITLIST_BOOKED',$5,'BOOKED',$6)`,
          entryId,
          tenantId,
          branchId,
          membershipId,
          target.status,
          `Appointment ${appointment.id} booked for ${input.startAt.toISOString()}`,
        );

        return {
          waitlist: booked[0],
          appointment,
          allocations: {
            roomId: input.roomId ?? null,
            assetId: input.assetId ?? null,
            blockedFrom,
            blockedTo,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async requireTarget(
    db: Pick<PrismaService, '$queryRawUnsafe'> | Prisma.TransactionClient,
    entryId: string,
    tenantId: string,
    companyId: string,
    branchId: string,
  ) {
    const rows = await db.$queryRawUnsafe<WaitlistTarget[]>(
      `SELECT w.id, w.customer_id AS "customerId", w.service_id AS "serviceId",
              w.preferred_staff_id AS "preferredStaffId",
              w.desired_from AS "desiredFrom", w.desired_to AS "desiredTo",
              w.preferred_time_start::text AS "preferredTimeStart",
              w.preferred_time_end::text AS "preferredTimeEnd",
              w.time_zone AS "timeZone", w.status, w.expires_at AS "expiresAt", w.version,
              s."durationMinutes" AS "durationMinutes",
              req.room_type AS "roomType", req.required_asset_type AS "requiredAssetType",
              req.required_asset_id AS "requiredAssetId",
              COALESCE(req.prep_duration_minutes, 0) AS "prepDurationMinutes",
              COALESCE(req.cleanup_duration_minutes, 0) AS "cleanupDurationMinutes"
       FROM operations_waitlist_entries w
       JOIN services s ON s.id = w.service_id AND s."tenantId" = w.tenant_id AND s."branchId" = w.branch_id
       LEFT JOIN service_operational_requirements req
         ON req.service_id = w.service_id AND req.tenant_id = w.tenant_id AND req.branch_id = w.branch_id
       WHERE w.id = $1 AND w.tenant_id = $2 AND w.company_id = $3 AND w.branch_id = $4
       LIMIT 1`,
      entryId,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows[0]) throw new NotFoundException('Waitlist entry not found');
    return rows[0];
  }

  private assertMatchable(target: WaitlistTarget) {
    if (!['WAITING', 'MATCH_FOUND', 'CONTACTED'].includes(target.status)) {
      throw new ConflictException(`Waitlist entry in ${target.status} state cannot be matched.`);
    }
    if (target.expiresAt && target.expiresAt <= new Date()) {
      throw new ConflictException('Waitlist entry has expired.');
    }
  }

  private assertRequestedSlot(target: WaitlistTarget, input: AcceptWaitlistMatchInput) {
    if (input.startAt >= input.endAt) {
      throw new BadRequestException('Slot start must be before end.');
    }
    const expectedEnd = input.startAt.getTime() + target.durationMinutes * 60_000;
    if (input.endAt.getTime() !== expectedEnd) {
      throw new BadRequestException('Slot duration does not match the service duration.');
    }
    if (input.startAt < target.desiredFrom || input.endAt > target.desiredTo) {
      throw new BadRequestException('Slot is outside the waitlist desired date range.');
    }
  }

  private async assertResourceSelection(
    tx: Prisma.TransactionClient,
    target: WaitlistTarget,
    input: AcceptWaitlistMatchInput,
    scope: {
      tenantId: string;
      companyId: string;
      branchId: string;
      blockedFrom: Date;
      blockedTo: Date;
    },
  ) {
    if (target.roomType && !input.roomId) {
      throw new BadRequestException(`Service requires room type ${target.roomType}.`);
    }
    if ((target.requiredAssetId || target.requiredAssetType) && !input.assetId) {
      throw new BadRequestException('Service requires an equipment resource.');
    }

    if (input.roomId) {
      await tx.$queryRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
        scope.branchId,
        `room:${input.roomId}`,
      );
      const rooms = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT r.id FROM operations_rooms r
         WHERE r.id = $1 AND r.tenant_id = $2 AND r.company_id = $3 AND r.branch_id = $4
           AND r.status = 'AVAILABLE' AND ($5::text IS NULL OR r.room_type = $5)
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_allocations ra
             WHERE ra.room_id = r.id AND ra.status = 'RESERVED'
               AND ra.blocked_from < $7 AND ra.blocked_to > $6
           )
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_blocks rb
             WHERE rb.room_id = r.id AND rb.status = 'ACTIVE'
               AND rb.blocked_from < $7 AND rb.blocked_to > $6
           )
         LIMIT 1`,
        input.roomId,
        scope.tenantId,
        scope.companyId,
        scope.branchId,
        target.roomType,
        scope.blockedFrom,
        scope.blockedTo,
      );
      if (!rooms[0]) throw new ConflictException('Selected room is no longer available.');
    }

    if (input.assetId) {
      await tx.$queryRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
        scope.branchId,
        `asset:${input.assetId}`,
      );
      const assets = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT a.id FROM inventory_assets a
         WHERE a.id = $1 AND a.company_id = $2 AND a.status = 'ACTIVE'
           AND (a.branch_id = $3 OR a.branch_id IS NULL)
           AND ($4::text IS NULL OR a.id = $4)
           AND ($5::text IS NULL OR a.asset_type = $5)
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_allocations ra
             WHERE ra.inventory_asset_id = a.id AND ra.status = 'RESERVED'
               AND ra.blocked_from < $7 AND ra.blocked_to > $6
           )
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_blocks rb
             WHERE rb.inventory_asset_id = a.id AND rb.status = 'ACTIVE'
               AND rb.blocked_from < $7 AND rb.blocked_to > $6
           )
           AND NOT EXISTS (
             SELECT 1 FROM inventory_asset_maintenance m
             WHERE m.asset_id = a.id AND m.status IN ('PLANNED','IN_PROGRESS')
               AND m.completed_at IS NULL
               AND (m.scheduled_at IS NULL OR m.scheduled_at < $7)
           )
         LIMIT 1`,
        input.assetId,
        scope.companyId,
        scope.branchId,
        target.requiredAssetId,
        target.requiredAssetType,
        scope.blockedFrom,
        scope.blockedTo,
      );
      if (!assets[0]) throw new ConflictException('Selected equipment is no longer available.');
    }
  }

  private async insertAllocation(
    tx: Prisma.TransactionClient,
    args: {
      appointmentId: string;
      tenantId: string;
      companyId: string;
      branchId: string;
      membershipId: string;
      blockedFrom: Date;
      blockedTo: Date;
      roomId: string | null;
      assetId: string | null;
    },
  ) {
    await tx.$executeRawUnsafe(
      `INSERT INTO operations_resource_allocations (
         tenant_id, company_id, branch_id, appointment_id, room_id,
         inventory_asset_id, blocked_from, blocked_to, created_by_membership_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      args.tenantId,
      args.companyId,
      args.branchId,
      args.appointmentId,
      args.roomId,
      args.assetId,
      args.blockedFrom,
      args.blockedTo,
      args.membershipId,
    );
  }

  private ceilToQuarterHour(value: Date) {
    const result = new Date(value);
    result.setSeconds(0, 0);
    const minutes = result.getMinutes();
    const remainder = minutes % 15;
    if (remainder) result.setMinutes(minutes + (15 - remainder));
    return result;
  }
}
