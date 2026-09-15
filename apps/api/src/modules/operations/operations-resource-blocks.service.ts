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
  CancelResourceBlockInput,
  CreateResourceBlockInput,
  ListResourceBlocksQueryInput,
} from './dto/operations-resource.dto';

type ResourceBlockRow = {
  id: string;
  roomId: string | null;
  assetId: string | null;
  roomName?: string | null;
  assetName?: string | null;
  blockedFrom: Date;
  blockedTo: Date;
  reason: string;
  status: 'ACTIVE' | 'CANCELLED';
  version: number;
  createdAt?: Date;
  cancelledAt?: Date | null;
};

@Injectable()
export class OperationsResourceBlocksService {
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

  async list(input: ListResourceBlocksQueryInput) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<ResourceBlockRow[]>(
      `SELECT b.id, b.room_id AS "roomId", b.inventory_asset_id AS "assetId",
              r.name AS "roomName", a.name AS "assetName",
              b.blocked_from AS "blockedFrom", b.blocked_to AS "blockedTo",
              b.reason, b.status, b.version, b.created_at AS "createdAt",
              b.cancelled_at AS "cancelledAt"
       FROM operations_resource_blocks b
       LEFT JOIN operations_rooms r ON r.id = b.room_id
       LEFT JOIN inventory_assets a ON a.id = b.inventory_asset_id
       WHERE b.tenant_id = $1 AND b.company_id = $2 AND b.branch_id = $3
         AND ($4::timestamptz IS NULL OR b.blocked_to > $4)
         AND ($5::timestamptz IS NULL OR b.blocked_from < $5)
       ORDER BY b.blocked_from ASC, b.created_at ASC`,
      tenantId,
      companyId,
      branchId,
      input.from ?? null,
      input.to ?? null,
    );
  }

  async create(input: CreateResourceBlockInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        const resourceKey = input.roomId
          ? `room:${input.roomId}`
          : `asset:${input.assetId}`;
        await tx.$queryRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
          branchId,
          resourceKey,
        );

        if (input.roomId) {
          const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM operations_rooms
             WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
             LIMIT 1`,
            input.roomId,
            tenantId,
            companyId,
            branchId,
          );
          if (!rows[0]) throw new NotFoundException('Room not found');
        } else if (input.assetId) {
          const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM inventory_assets
             WHERE id = $1 AND company_id = $2
               AND (branch_id = $3 OR branch_id IS NULL)
             LIMIT 1`,
            input.assetId,
            companyId,
            branchId,
          );
          if (!rows[0]) throw new NotFoundException('Equipment asset not found');
        }

        const allocationColumn = input.roomId ? 'room_id' : 'inventory_asset_id';
        const resourceId = input.roomId ?? input.assetId!;
        const allocations = await tx.$queryRawUnsafe<
          Array<{ appointmentId: string; blockedFrom: Date; blockedTo: Date }>
        >(
          `SELECT appointment_id AS "appointmentId", blocked_from AS "blockedFrom",
                  blocked_to AS "blockedTo"
           FROM operations_resource_allocations
           WHERE ${allocationColumn} = $1 AND status = 'RESERVED'
             AND blocked_from < $3 AND blocked_to > $2
           ORDER BY blocked_from ASC LIMIT 1`,
          resourceId,
          input.blockedFrom,
          input.blockedTo,
        );
        if (allocations[0]) {
          throw new ConflictException({
            code: 'RESOURCE_BLOCK_CONFLICTS_WITH_ALLOCATION',
            resourceId,
            conflictingAppointmentId: allocations[0].appointmentId,
            blockedFrom: allocations[0].blockedFrom,
            blockedTo: allocations[0].blockedTo,
          });
        }

        const duplicate = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id
           FROM operations_resource_blocks
           WHERE ${input.roomId ? 'room_id' : 'inventory_asset_id'} = $1
             AND status = 'ACTIVE'
             AND blocked_from = $2 AND blocked_to = $3 AND reason = $4
           LIMIT 1`,
          resourceId,
          input.blockedFrom,
          input.blockedTo,
          input.reason,
        );
        if (duplicate[0]) {
          const existing = await tx.$queryRawUnsafe<ResourceBlockRow[]>(
            `SELECT id, room_id AS "roomId", inventory_asset_id AS "assetId",
                    blocked_from AS "blockedFrom", blocked_to AS "blockedTo",
                    reason, status, version
             FROM operations_resource_blocks WHERE id = $1`,
            duplicate[0].id,
          );
          return existing[0];
        }

        const created = await tx.$queryRawUnsafe<ResourceBlockRow[]>(
          `INSERT INTO operations_resource_blocks (
             tenant_id, company_id, branch_id, room_id, inventory_asset_id,
             blocked_from, blocked_to, reason, created_by_membership_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, room_id AS "roomId", inventory_asset_id AS "assetId",
                     blocked_from AS "blockedFrom", blocked_to AS "blockedTo",
                     reason, status, version`,
          tenantId,
          companyId,
          branchId,
          input.roomId ?? null,
          input.assetId ?? null,
          input.blockedFrom,
          input.blockedTo,
          input.reason,
          membershipId,
        );
        return created[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async cancel(blockId: string, input: CancelResourceBlockInput) {
    const { tenantId, companyId, branchId, membershipId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<ResourceBlockRow[]>(
      `UPDATE operations_resource_blocks
       SET status = 'CANCELLED', version = version + 1,
           cancelled_by_membership_id = $5, cancelled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
         AND status = 'ACTIVE' AND version = $6
       RETURNING id, room_id AS "roomId", inventory_asset_id AS "assetId",
                 blocked_from AS "blockedFrom", blocked_to AS "blockedTo",
                 reason, status, version, cancelled_at AS "cancelledAt"`,
      blockId,
      tenantId,
      companyId,
      branchId,
      membershipId,
      input.expectedVersion,
    );
    if (!rows[0]) {
      throw new ConflictException(
        'Resource block changed or is no longer active. Refresh and retry.',
      );
    }
    return rows[0];
  }
}
