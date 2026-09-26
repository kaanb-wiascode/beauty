import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import type { FindWaitlistMatchesInput } from './dto/waitlist.dto';

@Injectable()
export class OperationsWaitlistRecoveryService {
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

  async candidates(appointmentId: string, input: FindWaitlistMatchesInput) {
    const { tenantId, companyId, branchId } = this.context();
    const appointments = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        serviceId: string;
        staffId: string;
        startAt: Date;
        endAt: Date;
        status: string;
        roomType: string | null;
        requiredAssetType: string | null;
        requiredAssetId: string | null;
        prepDurationMinutes: number;
        cleanupDurationMinutes: number;
      }>
    >(
      `SELECT ap.id, ap."serviceId" AS "serviceId", ap."staffId" AS "staffId",
              ap."startAt" AS "startAt", ap."endAt" AS "endAt", ap.status::text AS status,
              req.room_type AS "roomType", req.required_asset_type AS "requiredAssetType",
              req.required_asset_id AS "requiredAssetId",
              COALESCE(req.prep_duration_minutes, 0) AS "prepDurationMinutes",
              COALESCE(req.cleanup_duration_minutes, 0) AS "cleanupDurationMinutes"
       FROM appointments ap
       LEFT JOIN service_operational_requirements req
         ON req.service_id = ap."serviceId" AND req.tenant_id = ap."tenantId" AND req.branch_id = ap."branchId"
       WHERE ap.id = $1 AND ap."tenantId" = $2 AND ap."branchId" = $3
       LIMIT 1`,
      appointmentId,
      tenantId,
      branchId,
    );
    const appointment = appointments[0];
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (!['CANCELLED', 'NO_SHOW'].includes(appointment.status)) {
      throw new BadRequestException('Only cancelled or no-show appointments expose recovery capacity.');
    }

    const blockedFrom = new Date(
      appointment.startAt.getTime() - appointment.prepDurationMinutes * 60_000,
    );
    const blockedTo = new Date(
      appointment.endAt.getTime() + appointment.cleanupDurationMinutes * 60_000,
    );

    const candidates = await this.prisma.$queryRawUnsafe<
      Array<{
        entryId: string;
        entryVersion: number;
        customerId: string;
        customerName: string;
        priority: number;
        createdAt: Date;
        contactChannel: string;
        staffId: string;
        staffName: string;
        startAt: Date;
        endAt: Date;
        roomId: string | null;
        roomName: string | null;
        assetId: string | null;
        assetName: string | null;
      }>
    >(
      `WITH eligible AS (
         SELECT w.*, trim(concat(c."firstName", ' ', c."lastName")) AS customer_name
         FROM operations_waitlist_entries w
         JOIN customers c ON c.id = w.customer_id
         WHERE w.tenant_id = $1 AND w.company_id = $2 AND w.branch_id = $3
           AND w.service_id = $4
           AND w.status IN ('WAITING','MATCH_FOUND','CONTACTED')
           AND w.desired_from <= $6 AND w.desired_to >= $7
           AND (w.expires_at IS NULL OR w.expires_at > CURRENT_TIMESTAMP)
           AND (w.preferred_staff_id IS NULL OR w.preferred_staff_id = $5)
           AND (w.preferred_time_start IS NULL OR ($6::timestamptz AT TIME ZONE w.time_zone)::time >= w.preferred_time_start)
           AND (w.preferred_time_end IS NULL OR ($7::timestamptz AT TIME ZONE w.time_zone)::time <= w.preferred_time_end)
       )
       SELECT e.id AS "entryId", e.version AS "entryVersion",
              e.customer_id AS "customerId", e.customer_name AS "customerName",
              e.priority, e.created_at AS "createdAt", e.contact_channel AS "contactChannel",
              st.id AS "staffId", trim(concat(st."firstName", ' ', st."lastName")) AS "staffName",
              $6::timestamptz AS "startAt", $7::timestamptz AS "endAt",
              room.id AS "roomId", room.name AS "roomName",
              asset.id AS "assetId", asset.name AS "assetName"
       FROM eligible e
       JOIN staff st ON st.id = $5 AND st."tenantId" = $1 AND st."branchId" = $3 AND st.status::text = 'ACTIVE'
       LEFT JOIN LATERAL (
         SELECT r.id, r.name
         FROM operations_rooms r
         WHERE $10::text IS NOT NULL
           AND r.tenant_id = $1 AND r.company_id = $2 AND r.branch_id = $3
           AND r.status = 'AVAILABLE' AND r.room_type = $10
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_allocations ra
             WHERE ra.room_id = r.id AND ra.status = 'RESERVED'
               AND ra.blocked_from < $9 AND ra.blocked_to > $8
           )
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_blocks rb
             WHERE rb.room_id = r.id AND rb.status = 'ACTIVE'
               AND rb.blocked_from < $9 AND rb.blocked_to > $8
           )
         ORDER BY CASE WHEN EXISTS (
           SELECT 1 FROM operations_resource_allocations old
           WHERE old.appointment_id = $12 AND old.room_id = r.id
         ) THEN 0 ELSE 1 END, r.name ASC
         LIMIT 1
       ) room ON TRUE
       LEFT JOIN LATERAL (
         SELECT a.id, a.name
         FROM inventory_assets a
         WHERE ($11::text IS NOT NULL OR $13::text IS NOT NULL)
           AND a.company_id = $2 AND a.status = 'ACTIVE'
           AND (a.branch_id = $3 OR a.branch_id IS NULL)
           AND ($13::text IS NULL OR a.id = $13)
           AND ($11::text IS NULL OR a.asset_type = $11)
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_allocations ra
             WHERE ra.inventory_asset_id = a.id AND ra.status = 'RESERVED'
               AND ra.blocked_from < $9 AND ra.blocked_to > $8
           )
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_blocks rb
             WHERE rb.inventory_asset_id = a.id AND rb.status = 'ACTIVE'
               AND rb.blocked_from < $9 AND rb.blocked_to > $8
           )
           AND NOT EXISTS (
             SELECT 1 FROM inventory_asset_maintenance m
             WHERE m.asset_id = a.id AND m.status IN ('PLANNED','IN_PROGRESS')
               AND m.completed_at IS NULL
               AND (m.scheduled_at IS NULL OR m.scheduled_at < $9)
           )
         ORDER BY CASE WHEN EXISTS (
           SELECT 1 FROM operations_resource_allocations old
           WHERE old.appointment_id = $12 AND old.inventory_asset_id = a.id
         ) THEN 0 ELSE 1 END, CASE WHEN a.branch_id = $3 THEN 0 ELSE 1 END, a.name ASC
         LIMIT 1
       ) asset ON TRUE
       WHERE ($10::text IS NULL OR room.id IS NOT NULL)
         AND (($11::text IS NULL AND $13::text IS NULL) OR asset.id IS NOT NULL)
       ORDER BY e.priority DESC, e.created_at ASC
       LIMIT $14`,
      tenantId,
      companyId,
      branchId,
      appointment.serviceId,
      appointment.staffId,
      appointment.startAt,
      appointment.endAt,
      blockedFrom,
      blockedTo,
      appointment.roomType,
      appointment.requiredAssetType,
      appointmentId,
      appointment.requiredAssetId,
      input.limit,
    );

    return {
      appointmentId,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      blockedFrom,
      blockedTo,
      candidates,
    };
  }
}
