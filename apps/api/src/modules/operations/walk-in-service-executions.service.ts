import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import type { StartWalkInServiceExecutionInput } from './dto/walk-in-service-execution.dto';
import { OperationsStaffEligibilityService } from './operations-staff-eligibility.service';

type WalkInContextRow = {
  contextId: string;
  visitId: string;
  visitStatus: string;
  customerId: string;
  saleId: string;
  saleStatus: string;
  saleItemId: string;
  serviceId: string;
  quantity: number;
  durationMinutes: number;
};

@Injectable()
export class WalkInServiceExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly eligibility: OperationsStaffEligibilityService,
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

  async start(visitId: string, input: StartWalkInServiceExecutionInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    const contextRows = await this.prisma.$queryRawUnsafe<WalkInContextRow[]>(
      `SELECT wc.id AS "contextId", v."id" AS "visitId", v."status"::text AS "visitStatus",
              v."customerId" AS "customerId", s.id AS "saleId", s.status::text AS "saleStatus",
              si.id AS "saleItemId", si."serviceId" AS "serviceId", si.quantity,
              svc."durationMinutes" AS "durationMinutes"
       FROM operations_walk_in_commercial_contexts wc
       JOIN "visits" v ON v."id" = wc.visit_id
       JOIN sales s ON s.id = wc.sale_id
       JOIN sale_items si ON si."saleId" = s.id
       JOIN services svc ON svc.id = si."serviceId"
       WHERE wc.id = $1 AND wc.visit_id = $2
         AND wc.tenant_id = $3 AND wc.company_id = $4 AND wc.branch_id = $5
         AND v."tenantId" = $3 AND v."companyId" = $4 AND v."branchId" = $5
         AND v."source" = 'WALK_IN'::"VisitSource"
         AND s."tenantId" = $3 AND s."branchId" = $5 AND s."customerId" = v."customerId"
         AND si.id = $6 AND si.type = 'SERVICE'::"SaleItemType"
         AND svc."tenantId" = $3 AND svc."branchId" = $5 AND svc.status = 'ACTIVE'::"ServiceStatus"
       LIMIT 1`,
      input.commercialContextId,
      visitId,
      tenantId,
      companyId,
      branchId,
      input.saleItemId,
    );
    const commercial = contextRows[0];
    if (!commercial) {
      throw new NotFoundException('Walk-in commercial service context was not found in the active branch.');
    }
    if (commercial.visitStatus !== 'IN_SERVICE') {
      throw new BadRequestException('Walk-in visit must be IN_SERVICE before starting service execution.');
    }
    if (commercial.saleStatus !== 'CONFIRMED') {
      throw new BadRequestException('Walk-in sale must be CONFIRMED before starting service execution.');
    }
    if (commercial.quantity !== 1) {
      throw new BadRequestException('Walk-in service sale items must use quantity 1 per execution. Split repeated services into separate sale items.');
    }

    const staff = await this.prisma.staff.findFirst({
      where: { id: input.staffId, tenantId, branchId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Active staff member not found in the selected branch.');

    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + commercial.durationMinutes * 60_000);
    const eligibility = await this.eligibility.check({
      staffId: input.staffId,
      serviceId: commercial.serviceId,
      startAt,
      endAt,
    });
    if (!eligibility.allowed) {
      throw new ConflictException({
        code: 'STAFF_ELIGIBILITY_BLOCKED',
        message: 'Selected staff does not satisfy the active eligibility policy.',
        blockers: eligibility.blockers,
      });
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `WITH _advisory_lock AS (SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))) SELECT 1 FROM _advisory_lock`,
          `${tenantId}:${branchId}`,
          `walk-in-execution:${input.commercialContextId}:${input.saleItemId}`,
        );

        const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM operations_service_executions
           WHERE walk_in_commercial_context_id = $1 AND sale_item_id = $2
             AND tenant_id = $3 AND company_id = $4 AND branch_id = $5
             AND status <> 'CANCELLED'::"ServiceExecutionStatus"
           LIMIT 1`,
          input.commercialContextId,
          input.saleItemId,
          tenantId,
          companyId,
          branchId,
        );
        if (existing[0]) return this.getExecution(tx, existing[0].id, tenantId, companyId, branchId);

        await this.assertResources(
          tx,
          commercial.serviceId,
          input.roomId ?? null,
          input.assetId ?? null,
          startAt,
          endAt,
          tenantId,
          companyId,
          branchId,
        );

        const created = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO operations_service_executions (
             tenant_id, company_id, branch_id, visit_id, appointment_id,
             walk_in_commercial_context_id, sale_item_id,
             service_id, staff_id, room_id, inventory_asset_id, note,
             created_by_membership_id
           ) VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id, visit_id AS "visitId", appointment_id AS "appointmentId",
                     walk_in_commercial_context_id AS "walkInCommercialContextId",
                     sale_item_id AS "saleItemId", service_id AS "serviceId",
                     staff_id AS "staffId", room_id AS "roomId",
                     inventory_asset_id AS "assetId", status,
                     started_at AS "startedAt", completed_at AS "completedAt",
                     note, completion_note AS "completionNote", version`,
          tenantId,
          companyId,
          branchId,
          visitId,
          input.commercialContextId,
          input.saleItemId,
          commercial.serviceId,
          input.staffId,
          input.roomId ?? null,
          input.assetId ?? null,
          input.note ?? null,
          membershipId,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_service_execution_events (
             execution_id, tenant_id, branch_id, actor_membership_id,
             event_type, from_status, to_status, note
           ) VALUES ($1,$2,$3,$4,'WALK_IN_SERVICE_STARTED',NULL,'IN_PROGRESS',$5)`,
          created[0].id,
          tenantId,
          branchId,
          membershipId,
          input.note ?? null,
        );

        return created[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async getExecution(
    db: Prisma.TransactionClient,
    executionId: string,
    tenantId: string,
    companyId: string,
    branchId: string,
  ) {
    const rows = await db.$queryRawUnsafe<any[]>(
      `SELECT id, visit_id AS "visitId", appointment_id AS "appointmentId",
              walk_in_commercial_context_id AS "walkInCommercialContextId",
              sale_item_id AS "saleItemId", service_id AS "serviceId", staff_id AS "staffId",
              room_id AS "roomId", inventory_asset_id AS "assetId", status,
              started_at AS "startedAt", completed_at AS "completedAt",
              note, completion_note AS "completionNote", version
       FROM operations_service_executions
       WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND branch_id=$4 LIMIT 1`,
      executionId,
      tenantId,
      companyId,
      branchId,
    );
    return rows[0];
  }

  private async assertResources(
    tx: Prisma.TransactionClient,
    serviceId: string,
    roomId: string | null,
    assetId: string | null,
    startAt: Date,
    endAt: Date,
    tenantId: string,
    companyId: string,
    branchId: string,
  ) {
    const req = await tx.$queryRawUnsafe<Array<{
      roomType: string | null;
      requiredAssetType: string | null;
      requiredAssetId: string | null;
    }>>(
      `SELECT room_type AS "roomType", required_asset_type AS "requiredAssetType",
              required_asset_id AS "requiredAssetId"
       FROM service_operational_requirements
       WHERE service_id=$1 AND tenant_id=$2 AND branch_id=$3 LIMIT 1`,
      serviceId,
      tenantId,
      branchId,
    );
    const requirement = req[0];

    if (requirement?.roomType) {
      if (!roomId) throw new BadRequestException(`Service requires a ${requirement.roomType} room.`);
      const rooms = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT r.id FROM operations_rooms r
         WHERE r.id=$1 AND r.tenant_id=$2 AND r.company_id=$3 AND r.branch_id=$4
           AND r.room_type=$5 AND r.status IN ('AVAILABLE','RESERVED')
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_blocks b
             WHERE b.room_id=r.id AND b.tenant_id=$2 AND b.branch_id=$4
               AND b.status='ACTIVE' AND b.blocked_from < $7 AND b.blocked_to > $6
           )
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_allocations a
             WHERE a.room_id=r.id AND a.tenant_id=$2 AND a.branch_id=$4
               AND a.status='RESERVED' AND a.blocked_from < $7 AND a.blocked_to > $6
           ) LIMIT 1`,
        roomId,
        tenantId,
        companyId,
        branchId,
        requirement.roomType,
        startAt,
        endAt,
      );
      if (!rooms[0]) throw new ConflictException('Selected room is unavailable or does not satisfy the service requirement.');
    }

    if (requirement?.requiredAssetId || requirement?.requiredAssetType) {
      if (!assetId) throw new BadRequestException('Service requires an equipment selection.');
      const assets = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT a.id FROM inventory_assets a
         WHERE a.id=$1 AND a.tenant_id=$2 AND a.company_id=$3 AND a.branch_id=$4
           AND a.status='ACTIVE'
           AND ($5::text IS NULL OR a.id=$5)
           AND ($6::text IS NULL OR a.asset_type=$6)
           AND NOT EXISTS (
             SELECT 1 FROM inventory_asset_maintenance m
             WHERE m.asset_id=a.id AND m.status IN ('PLANNED','IN_PROGRESS')
               AND m.completed_at IS NULL
               AND (m.scheduled_at IS NULL OR m.scheduled_at <= CURRENT_TIMESTAMP)
           )
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_blocks b
             WHERE b.inventory_asset_id=a.id AND b.tenant_id=$2 AND b.branch_id=$4
               AND b.status='ACTIVE' AND b.blocked_from < $8 AND b.blocked_to > $7
           )
           AND NOT EXISTS (
             SELECT 1 FROM operations_resource_allocations ra
             WHERE ra.inventory_asset_id=a.id AND ra.tenant_id=$2 AND ra.branch_id=$4
               AND ra.status='RESERVED' AND ra.blocked_from < $8 AND ra.blocked_to > $7
           ) LIMIT 1`,
        assetId,
        tenantId,
        companyId,
        branchId,
        requirement.requiredAssetId,
        requirement.requiredAssetType,
        startAt,
        endAt,
      );
      if (!assets[0]) throw new ConflictException('Selected equipment is unavailable or does not satisfy the service requirement.');
    }
  }
}
