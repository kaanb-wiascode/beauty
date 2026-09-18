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
  CreateOperationsIncidentInput,
  ListOperationsIncidentsInput,
  ResolveOperationsIncidentInput,
} from './dto/operations-incident.dto';

type IncidentRow = {
  id: string;
  type: string;
  severity: string;
  status: 'OPEN' | 'RESOLVED';
  title: string;
  description: string | null;
  roomId: string | null;
  assetId: string | null;
  resourceBlockId: string | null;
  qualityCaseId: string | null;
  openedAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  version: number;
};

@Injectable()
export class OperationsIncidentsService {
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

  async list(input: ListOperationsIncidentsInput) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<
      Array<IncidentRow & { roomName: string | null; assetName: string | null }>
    >(
      `SELECT i.id, i.type, i.severity, i.status, i.title, i.description,
              i.room_id AS "roomId", i.inventory_asset_id AS "assetId",
              i.resource_block_id AS "resourceBlockId",
              i.quality_case_id AS "qualityCaseId", i.opened_at AS "openedAt",
              i.resolved_at AS "resolvedAt", i.resolution_note AS "resolutionNote",
              i.version, r.name AS "roomName", a.name AS "assetName"
       FROM operations_incidents i
       LEFT JOIN operations_rooms r ON r.id = i.room_id
       LEFT JOIN inventory_assets a ON a.id = i.inventory_asset_id
       WHERE i.tenant_id = $1 AND i.company_id = $2 AND i.branch_id = $3
         AND ($4::text IS NULL OR i.status = $4)
         AND ($5::text IS NULL OR i.severity = $5)
       ORDER BY CASE i.severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC,
                i.opened_at DESC`,
      tenantId,
      companyId,
      branchId,
      input.status ?? null,
      input.severity ?? null,
    );
  }

  async create(input: CreateOperationsIncidentInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    const outageFrom = input.outageFrom ?? new Date();
    if (input.outageTo && input.outageTo <= outageFrom) {
      throw new BadRequestException('Expected outage end must be after outage start.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        if (input.roomId) {
          const rooms = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM operations_rooms
             WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
             LIMIT 1`,
            input.roomId,
            tenantId,
            companyId,
            branchId,
          );
          if (!rooms[0]) throw new NotFoundException('Room not found');
          await this.lockResource(tx, branchId, `room:${input.roomId}`);
        }
        if (input.assetId) {
          const assets = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM inventory_assets
             WHERE id = $1 AND company_id = $2
               AND (branch_id = $3 OR branch_id IS NULL)
             LIMIT 1`,
            input.assetId,
            companyId,
            branchId,
          );
          if (!assets[0]) throw new NotFoundException('Equipment asset not found');
          await this.lockResource(tx, branchId, `asset:${input.assetId}`);
        }
        if (input.qualityCaseId) {
          const cases = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM quality_cases
             WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
             LIMIT 1`,
            input.qualityCaseId,
            tenantId,
            companyId,
            branchId,
          );
          if (!cases[0]) throw new NotFoundException('Quality case not found');
        }

        let resourceBlockId: string | null = null;
        if ((input.roomId || input.assetId) && input.outageTo) {
          const conflicts = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM operations_resource_blocks
             WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
               AND status = 'ACTIVE'
               AND room_id IS NOT DISTINCT FROM $4::text
               AND inventory_asset_id IS NOT DISTINCT FROM $5::text
               AND blocked_from < $7 AND blocked_to > $6
             LIMIT 1`,
            tenantId,
            companyId,
            branchId,
            input.roomId ?? null,
            input.assetId ?? null,
            outageFrom,
            input.outageTo,
          );
          if (conflicts[0]) {
            throw new ConflictException('Resource already has an overlapping unavailability block.');
          }
          const blocks = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `INSERT INTO operations_resource_blocks (
               tenant_id, company_id, branch_id, room_id, inventory_asset_id,
               blocked_from, blocked_to, reason, created_by_membership_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING id`,
            tenantId,
            companyId,
            branchId,
            input.roomId ?? null,
            input.assetId ?? null,
            outageFrom,
            input.outageTo,
            `Incident: ${input.title}`,
            membershipId,
          );
          resourceBlockId = blocks[0].id;
        }

        const rows = await tx.$queryRawUnsafe<IncidentRow[]>(
          `INSERT INTO operations_incidents (
             tenant_id, company_id, branch_id, type, severity, title, description,
             room_id, inventory_asset_id, resource_block_id, quality_case_id,
             opened_at, reported_by_membership_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING id, type, severity, status, title, description,
                     room_id AS "roomId", inventory_asset_id AS "assetId",
                     resource_block_id AS "resourceBlockId",
                     quality_case_id AS "qualityCaseId", opened_at AS "openedAt",
                     resolved_at AS "resolvedAt", resolution_note AS "resolutionNote", version`,
          tenantId,
          companyId,
          branchId,
          input.type,
          input.severity,
          input.title,
          input.description ?? null,
          input.roomId ?? null,
          input.assetId ?? null,
          resourceBlockId,
          input.qualityCaseId ?? null,
          outageFrom,
          membershipId,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO operations_incident_events (
             incident_id, tenant_id, branch_id, actor_membership_id, event_type, note
           ) VALUES ($1,$2,$3,$4,'INCIDENT_OPENED',$5)`,
          rows[0].id,
          tenantId,
          branchId,
          membershipId,
          input.description ?? null,
        );
        return rows[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async affectedAppointments(incidentId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const incidents = await this.prisma.$queryRawUnsafe<
      Array<IncidentRow & { blockedFrom: Date | null; blockedTo: Date | null }>
    >(
      `SELECT i.id, i.type, i.severity, i.status, i.title, i.description,
              i.room_id AS "roomId", i.inventory_asset_id AS "assetId",
              i.resource_block_id AS "resourceBlockId", i.quality_case_id AS "qualityCaseId",
              i.opened_at AS "openedAt", i.resolved_at AS "resolvedAt",
              i.resolution_note AS "resolutionNote", i.version,
              rb.blocked_from AS "blockedFrom", rb.blocked_to AS "blockedTo"
       FROM operations_incidents i
       LEFT JOIN operations_resource_blocks rb ON rb.id = i.resource_block_id
       WHERE i.id = $1 AND i.tenant_id = $2 AND i.company_id = $3 AND i.branch_id = $4
       LIMIT 1`,
      incidentId,
      tenantId,
      companyId,
      branchId,
    );
    const incident = incidents[0];
    if (!incident) throw new NotFoundException('Incident not found');
    if (!incident.blockedFrom || !incident.blockedTo || (!incident.roomId && !incident.assetId)) {
      return [];
    }
    return this.prisma.$queryRawUnsafe(
      `SELECT DISTINCT a.id, a."customerId" AS "customerId", a."serviceId" AS "serviceId",
              a."staffId" AS "staffId", a."startAt" AS "startAt", a."endAt" AS "endAt",
              a.status::text AS status, s.name AS "serviceName",
              trim(concat(c."firstName", ' ', c."lastName")) AS "customerName"
       FROM operations_resource_allocations ra
       JOIN appointments a ON a.id = ra.appointment_id
       JOIN services s ON s.id = a."serviceId"
       JOIN customers c ON c.id = a."customerId"
       WHERE ra.tenant_id = $1 AND ra.company_id = $2 AND ra.branch_id = $3
         AND ra.status = 'RESERVED'
         AND (($4::text IS NOT NULL AND ra.room_id = $4) OR
              ($5::text IS NOT NULL AND ra.inventory_asset_id = $5))
         AND ra.blocked_from < $7 AND ra.blocked_to > $6
         AND a.status::text NOT IN ('CANCELLED','NO_SHOW','COMPLETED')
       ORDER BY a."startAt" ASC`,
      tenantId,
      companyId,
      branchId,
      incident.roomId,
      incident.assetId,
      incident.blockedFrom,
      incident.blockedTo,
    );
  }

  async resolve(incidentId: string, input: ResolveOperationsIncidentInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
          `${tenantId}:${branchId}`,
          `incident:${incidentId}`,
        );
        const rows = await tx.$queryRawUnsafe<IncidentRow[]>(
          `SELECT id, type, severity, status, title, description,
                  room_id AS "roomId", inventory_asset_id AS "assetId",
                  resource_block_id AS "resourceBlockId", quality_case_id AS "qualityCaseId",
                  opened_at AS "openedAt", resolved_at AS "resolvedAt",
                  resolution_note AS "resolutionNote", version
           FROM operations_incidents
           WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
           LIMIT 1`,
          incidentId,
          tenantId,
          companyId,
          branchId,
        );
        const current = rows[0];
        if (!current) throw new NotFoundException('Incident not found');
        if (current.status !== 'OPEN') throw new ConflictException('Incident is already resolved.');
        if (current.version !== input.expectedVersion) {
          throw new ConflictException('Incident changed since it was read. Refresh and retry.');
        }

        if (current.resourceBlockId) {
          await tx.$executeRawUnsafe(
            `UPDATE operations_resource_blocks
             SET status = 'CANCELLED', cancelled_by_membership_id = $5,
                 cancelled_at = CURRENT_TIMESTAMP, version = version + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
               AND status = 'ACTIVE'`,
            current.resourceBlockId,
            tenantId,
            companyId,
            branchId,
            membershipId,
          );
        }

        const resolved = await tx.$queryRawUnsafe<IncidentRow[]>(
          `UPDATE operations_incidents
           SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP,
               resolved_by_membership_id = $5, resolution_note = $6,
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
             AND status = 'OPEN' AND version = $7
           RETURNING id, type, severity, status, title, description,
                     room_id AS "roomId", inventory_asset_id AS "assetId",
                     resource_block_id AS "resourceBlockId", quality_case_id AS "qualityCaseId",
                     opened_at AS "openedAt", resolved_at AS "resolvedAt",
                     resolution_note AS "resolutionNote", version`,
          incidentId,
          tenantId,
          companyId,
          branchId,
          membershipId,
          input.resolutionNote,
          input.expectedVersion,
        );
        if (!resolved[0]) throw new ConflictException('Incident changed during resolution.');
        await tx.$executeRawUnsafe(
          `INSERT INTO operations_incident_events (
             incident_id, tenant_id, branch_id, actor_membership_id, event_type, note
           ) VALUES ($1,$2,$3,$4,'INCIDENT_RESOLVED',$5)`,
          incidentId,
          tenantId,
          branchId,
          membershipId,
          input.resolutionNote,
        );
        return resolved[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async lockResource(
    tx: Prisma.TransactionClient,
    branchId: string,
    key: string,
  ) {
    await tx.$queryRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      branchId,
      key,
    );
  }
}
