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
  CompleteServiceExecutionInput,
  StartServiceExecutionInput,
} from './dto/service-execution.dto';

type ExecutionRow = {
  id: string;
  visitId: string;
  appointmentId: string;
  serviceId: string;
  staffId: string;
  roomId: string | null;
  assetId: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  startedAt: Date;
  completedAt: Date | null;
  note: string | null;
  completionNote: string | null;
  version: number;
};

@Injectable()
export class ServiceExecutionsService {
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

  async listByVisit(visitId: string) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<ExecutionRow[]>(
      `SELECT e.id, e.visit_id AS "visitId", e.appointment_id AS "appointmentId",
              e.service_id AS "serviceId", e.staff_id AS "staffId",
              e.room_id AS "roomId", e.inventory_asset_id AS "assetId",
              e.status, e.started_at AS "startedAt", e.completed_at AS "completedAt",
              e.note, e.completion_note AS "completionNote", e.version
       FROM operations_service_executions e
       WHERE e.visit_id = $1 AND e.tenant_id = $2
         AND e.company_id = $3 AND e.branch_id = $4
       ORDER BY e.started_at ASC, e.id ASC`,
      visitId,
      tenantId,
      companyId,
      branchId,
    );
  }

  async start(visitId: string, input: StartServiceExecutionInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
          `${tenantId}:${branchId}`,
          `execution:${input.appointmentId}`,
        );

        const existing = await tx.$queryRawUnsafe<ExecutionRow[]>(
          `SELECT id, visit_id AS "visitId", appointment_id AS "appointmentId",
                  service_id AS "serviceId", staff_id AS "staffId",
                  room_id AS "roomId", inventory_asset_id AS "assetId",
                  status, started_at AS "startedAt", completed_at AS "completedAt",
                  note, completion_note AS "completionNote", version
           FROM operations_service_executions
           WHERE appointment_id = $1 AND visit_id = $2
             AND tenant_id = $3 AND company_id = $4 AND branch_id = $5
             AND status <> 'CANCELLED'::"ServiceExecutionStatus"
           LIMIT 1`,
          input.appointmentId,
          visitId,
          tenantId,
          companyId,
          branchId,
        );
        if (existing[0]) return existing[0];

        const rows = await tx.$queryRawUnsafe<
          Array<{
            visitId: string;
            visitStatus: string;
            appointmentId: string;
            appointmentStatus: string;
            serviceId: string;
            staffId: string;
          }>
        >(
          `SELECT v."id" AS "visitId", v."status"::text AS "visitStatus",
                  a."id" AS "appointmentId", a."status"::text AS "appointmentStatus",
                  a."serviceId" AS "serviceId", a."staffId" AS "staffId"
           FROM "visits" v
           JOIN "visit_appointments" va ON va."visitId" = v."id"
           JOIN "appointments" a ON a."id" = va."appointmentId"
           WHERE v."id" = $1 AND va."appointmentId" = $2
             AND v."tenantId" = $3 AND v."companyId" = $4 AND v."branchId" = $5
             AND a."tenantId" = $3 AND a."branchId" = $5
           LIMIT 1`,
          visitId,
          input.appointmentId,
          tenantId,
          companyId,
          branchId,
        );
        const context = rows[0];
        if (!context) {
          throw new NotFoundException(
            'Visit or linked appointment was not found in the active branch.',
          );
        }
        if (context.visitStatus !== 'IN_SERVICE') {
          throw new BadRequestException(
            'Visit must be IN_SERVICE before starting service execution.',
          );
        }
        if (!['SCHEDULED', 'CONFIRMED'].includes(context.appointmentStatus)) {
          throw new BadRequestException(
            'Linked appointment is not in an executable state.',
          );
        }

        const [requirements, allocations] = await Promise.all([
          tx.$queryRawUnsafe<
            Array<{
              roomType: string | null;
              requiredAssetType: string | null;
              requiredAssetId: string | null;
            }>
          >(
            `SELECT room_type AS "roomType", required_asset_type AS "requiredAssetType",
                    required_asset_id AS "requiredAssetId"
             FROM service_operational_requirements
             WHERE service_id = $1 AND tenant_id = $2 AND branch_id = $3
             LIMIT 1`,
            context.serviceId,
            tenantId,
            branchId,
          ),
          tx.$queryRawUnsafe<
            Array<{ roomId: string | null; assetId: string | null }>
          >(
            `SELECT room_id AS "roomId", inventory_asset_id AS "assetId"
             FROM operations_resource_allocations
             WHERE appointment_id = $1 AND tenant_id = $2
               AND company_id = $3 AND branch_id = $4 AND status = 'RESERVED'`,
            input.appointmentId,
            tenantId,
            companyId,
            branchId,
          ),
        ]);

        const requirement = requirements[0];
        const roomId = allocations.find((item) => item.roomId)?.roomId ?? null;
        const assetId = allocations.find((item) => item.assetId)?.assetId ?? null;
        if (requirement?.roomType && !roomId) {
          throw new BadRequestException(
            `Service requires a room allocation of type ${requirement.roomType}.`,
          );
        }
        if (
          (requirement?.requiredAssetId || requirement?.requiredAssetType) &&
          !assetId
        ) {
          throw new BadRequestException(
            'Service requires an equipment allocation before execution can start.',
          );
        }

        const created = await tx.$queryRawUnsafe<ExecutionRow[]>(
          `INSERT INTO operations_service_executions (
             tenant_id, company_id, branch_id, visit_id, appointment_id,
             service_id, staff_id, room_id, inventory_asset_id, note,
             created_by_membership_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id, visit_id AS "visitId", appointment_id AS "appointmentId",
                     service_id AS "serviceId", staff_id AS "staffId",
                     room_id AS "roomId", inventory_asset_id AS "assetId",
                     status, started_at AS "startedAt", completed_at AS "completedAt",
                     note, completion_note AS "completionNote", version`,
          tenantId,
          companyId,
          branchId,
          visitId,
          input.appointmentId,
          context.serviceId,
          context.staffId,
          roomId,
          assetId,
          input.note ?? null,
          membershipId,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_service_execution_events (
             execution_id, tenant_id, branch_id, actor_membership_id,
             event_type, from_status, to_status, note
           ) VALUES ($1,$2,$3,$4,'SERVICE_STARTED',NULL,'IN_PROGRESS',$5)`,
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

  async complete(executionId: string, input: CompleteServiceExecutionInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
          `${tenantId}:${branchId}`,
          `execution:${executionId}`,
        );

        const rows = await tx.$queryRawUnsafe<ExecutionRow[]>(
          `SELECT id, visit_id AS "visitId", appointment_id AS "appointmentId",
                  service_id AS "serviceId", staff_id AS "staffId",
                  room_id AS "roomId", inventory_asset_id AS "assetId",
                  status, started_at AS "startedAt", completed_at AS "completedAt",
                  note, completion_note AS "completionNote", version
           FROM operations_service_executions
           WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
           LIMIT 1`,
          executionId,
          tenantId,
          companyId,
          branchId,
        );
        const current = rows[0];
        if (!current) throw new NotFoundException('Service execution not found');
        if (current.version !== input.expectedVersion) {
          throw new ConflictException(
            'Service execution changed since it was read. Refresh and retry.',
          );
        }
        if (current.status !== 'IN_PROGRESS') {
          throw new BadRequestException(
            'Only an in-progress service execution can be completed.',
          );
        }

        const completed = await tx.$queryRawUnsafe<ExecutionRow[]>(
          `UPDATE operations_service_executions
           SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP,
               completion_note = $5, version = version + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
             AND status = 'IN_PROGRESS' AND version = $6
           RETURNING id, visit_id AS "visitId", appointment_id AS "appointmentId",
                     service_id AS "serviceId", staff_id AS "staffId",
                     room_id AS "roomId", inventory_asset_id AS "assetId",
                     status, started_at AS "startedAt", completed_at AS "completedAt",
                     note, completion_note AS "completionNote", version`,
          executionId,
          tenantId,
          companyId,
          branchId,
          input.completionNote ?? null,
          input.expectedVersion,
        );
        if (!completed[0]) {
          throw new ConflictException(
            'Service execution changed during completion. Refresh and retry.',
          );
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_service_execution_events (
             execution_id, tenant_id, branch_id, actor_membership_id,
             event_type, from_status, to_status, note
           ) VALUES ($1,$2,$3,$4,'SERVICE_COMPLETED','IN_PROGRESS','COMPLETED',$5)`,
          executionId,
          tenantId,
          branchId,
          membershipId,
          input.completionNote ?? null,
        );

        const remaining = await tx.$queryRawUnsafe<Array<{ count: number }>>(
          `SELECT COUNT(*)::int AS count
           FROM operations_service_executions
           WHERE visit_id = $1 AND tenant_id = $2 AND branch_id = $3
             AND status = 'IN_PROGRESS'`,
          current.visitId,
          tenantId,
          branchId,
        );

        return {
          execution: completed[0],
          visitCanCompleteService: Number(remaining[0]?.count ?? 0) === 0,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
