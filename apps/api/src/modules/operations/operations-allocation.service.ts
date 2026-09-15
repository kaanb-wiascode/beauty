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
  AllocateAppointmentResourcesInput,
  ReleaseAllocationInput,
} from './dto/operations-resource.dto';

@Injectable()
export class OperationsAllocationService {
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

  async listAppointmentAllocations(appointmentId: string) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe(
      `SELECT ra.id, ra.appointment_id AS "appointmentId", ra.room_id AS "roomId",
              ra.inventory_asset_id AS "assetId", ra.blocked_from AS "blockedFrom",
              ra.blocked_to AS "blockedTo", ra.status, ra.version,
              r.name AS "roomName", a.name AS "assetName"
       FROM operations_resource_allocations ra
       LEFT JOIN operations_rooms r ON r.id = ra.room_id
       LEFT JOIN inventory_assets a ON a.id = ra.inventory_asset_id
       WHERE ra.appointment_id = $1 AND ra.tenant_id = $2
         AND ra.company_id = $3 AND ra.branch_id = $4
       ORDER BY ra.created_at ASC`,
      appointmentId,
      tenantId,
      companyId,
      branchId,
    );
  }

  async allocate(
    appointmentId: string,
    input: AllocateAppointmentResourcesInput,
  ) {
    const { tenantId, companyId, branchId, membershipId } = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        const appointments = await tx.$queryRawUnsafe<
          Array<{
            id: string;
            serviceId: string;
            startAt: Date;
            endAt: Date;
            status: string;
          }>
        >(
          `SELECT id, "serviceId", "startAt", "endAt", status::text AS status
           FROM appointments
           WHERE id = $1 AND "tenantId" = $2 AND "branchId" = $3
           LIMIT 1`,
          appointmentId,
          tenantId,
          branchId,
        );
        const appointment = appointments[0];
        if (!appointment) throw new NotFoundException('Appointment not found');
        if (!['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
          throw new BadRequestException(
            'Resources can only be reserved for scheduled or confirmed appointments.',
          );
        }

        const requirements = await tx.$queryRawUnsafe<
          Array<{
            roomType: string | null;
            requiredAssetType: string | null;
            requiredAssetId: string | null;
            prepDurationMinutes: number;
            cleanupDurationMinutes: number;
          }>
        >(
          `SELECT room_type AS "roomType", required_asset_type AS "requiredAssetType",
                  required_asset_id AS "requiredAssetId",
                  prep_duration_minutes AS "prepDurationMinutes",
                  cleanup_duration_minutes AS "cleanupDurationMinutes"
           FROM service_operational_requirements
           WHERE service_id = $1 AND tenant_id = $2 AND branch_id = $3
           LIMIT 1`,
          appointment.serviceId,
          tenantId,
          branchId,
        );
        const requirement = requirements[0] ?? {
          roomType: null,
          requiredAssetType: null,
          requiredAssetId: null,
          prepDurationMinutes: 0,
          cleanupDurationMinutes: 0,
        };
        const blockedFrom = new Date(
          appointment.startAt.getTime() - requirement.prepDurationMinutes * 60_000,
        );
        const blockedTo = new Date(
          appointment.endAt.getTime() + requirement.cleanupDurationMinutes * 60_000,
        );

        const allocations: unknown[] = [];
        if (input.roomId) {
          allocations.push(
            await this.reserveRoom(tx, {
              appointmentId,
              roomId: input.roomId,
              tenantId,
              companyId,
              branchId,
              membershipId,
              blockedFrom,
              blockedTo,
              requiredRoomType: requirement.roomType,
            }),
          );
        } else if (requirement.roomType) {
          throw new BadRequestException(
            `Service requires a room of type ${requirement.roomType}.`,
          );
        }

        if (input.assetId) {
          allocations.push(
            await this.reserveAsset(tx, {
              appointmentId,
              assetId: input.assetId,
              tenantId,
              companyId,
              branchId,
              membershipId,
              blockedFrom,
              blockedTo,
              requiredAssetType: requirement.requiredAssetType,
              requiredAssetId: requirement.requiredAssetId,
            }),
          );
        } else if (requirement.requiredAssetId || requirement.requiredAssetType) {
          throw new BadRequestException('Service requires an equipment resource.');
        }

        return { blockedFrom, blockedTo, allocations };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async release(allocationId: string, input: ReleaseAllocationInput) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; status: string; version: number }>
    >(
      `UPDATE operations_resource_allocations
       SET status = 'RELEASED', version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
         AND status = 'RESERVED' AND version = $5
       RETURNING id, status, version`,
      allocationId,
      tenantId,
      companyId,
      branchId,
      input.expectedVersion,
    );
    if (!rows[0]) {
      throw new ConflictException(
        'Allocation changed or is no longer reserved. Refresh and retry.',
      );
    }
    return rows[0];
  }

  private async reserveRoom(
    tx: Prisma.TransactionClient,
    args: {
      appointmentId: string;
      roomId: string;
      tenantId: string;
      companyId: string;
      branchId: string;
      membershipId: string;
      blockedFrom: Date;
      blockedTo: Date;
      requiredRoomType: string | null;
    },
  ) {
    await this.lockResource(tx, args.branchId, `room:${args.roomId}`);
    const roomRows = await tx.$queryRawUnsafe<
      Array<{ id: string; name: string; roomType: string; status: string }>
    >(
      `SELECT id, name, room_type AS "roomType", status
       FROM operations_rooms
       WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
       LIMIT 1`,
      args.roomId,
      args.tenantId,
      args.companyId,
      args.branchId,
    );
    const room = roomRows[0];
    if (!room) throw new NotFoundException('Room not found');
    if (room.status !== 'AVAILABLE') {
      throw new ConflictException({
        code: 'ROOM_UNAVAILABLE',
        resourceId: room.id,
        message: `${room.name} is currently ${room.status}.`,
      });
    }
    if (args.requiredRoomType && room.roomType !== args.requiredRoomType) {
      throw new BadRequestException(
        `Service requires room type ${args.requiredRoomType}.`,
      );
    }

    const existing = await this.findExisting(
      tx,
      args.appointmentId,
      'room_id',
      args.roomId,
    );
    if (existing) return existing;
    await this.assertNoOverlap(tx, 'room_id', args.roomId, args.blockedFrom, args.blockedTo);
    return this.insertAllocation(tx, args, { roomId: args.roomId, assetId: null });
  }

  private async reserveAsset(
    tx: Prisma.TransactionClient,
    args: {
      appointmentId: string;
      assetId: string;
      tenantId: string;
      companyId: string;
      branchId: string;
      membershipId: string;
      blockedFrom: Date;
      blockedTo: Date;
      requiredAssetType: string | null;
      requiredAssetId: string | null;
    },
  ) {
    await this.lockResource(tx, args.branchId, `asset:${args.assetId}`);
    const assets = await tx.$queryRawUnsafe<
      Array<{ id: string; name: string; assetType: string }>
    >(
      `SELECT id, name, asset_type AS "assetType"
       FROM inventory_assets
       WHERE id = $1 AND company_id = $2 AND status = 'ACTIVE'
         AND (branch_id = $3 OR branch_id IS NULL)
       LIMIT 1`,
      args.assetId,
      args.companyId,
      args.branchId,
    );
    const asset = assets[0];
    if (!asset) throw new NotFoundException('Equipment asset not found');
    if (args.requiredAssetId && asset.id !== args.requiredAssetId) {
      throw new BadRequestException('Service requires a different equipment asset.');
    }
    if (args.requiredAssetType && asset.assetType !== args.requiredAssetType) {
      throw new BadRequestException(
        `Service requires equipment type ${args.requiredAssetType}.`,
      );
    }

    const maintenance = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT m.id FROM inventory_asset_maintenance m
       WHERE m.asset_id = $1 AND m.status IN ('PLANNED', 'IN_PROGRESS')
         AND m.completed_at IS NULL
         AND (m.scheduled_at IS NULL OR m.scheduled_at < $3)
       LIMIT 1`,
      args.assetId,
      args.blockedFrom,
      args.blockedTo,
    );
    if (maintenance.length) {
      throw new ConflictException({
        code: 'ASSET_MAINTENANCE_BLOCK',
        resourceId: asset.id,
        message: `${asset.name} is unavailable due to maintenance.`,
      });
    }

    const existing = await this.findExisting(
      tx,
      args.appointmentId,
      'inventory_asset_id',
      args.assetId,
    );
    if (existing) return existing;
    await this.assertNoOverlap(
      tx,
      'inventory_asset_id',
      args.assetId,
      args.blockedFrom,
      args.blockedTo,
    );
    return this.insertAllocation(tx, args, { roomId: null, assetId: args.assetId });
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

  private async findExisting(
    tx: Prisma.TransactionClient,
    appointmentId: string,
    column: 'room_id' | 'inventory_asset_id',
    resourceId: string,
  ) {
    const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, status, version, blocked_from AS "blockedFrom", blocked_to AS "blockedTo"
       FROM operations_resource_allocations
       WHERE appointment_id = $1 AND ${column} = $2 AND status = 'RESERVED'
       LIMIT 1`,
      appointmentId,
      resourceId,
    );
    return rows[0] ?? null;
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    column: 'room_id' | 'inventory_asset_id',
    resourceId: string,
    blockedFrom: Date,
    blockedTo: Date,
  ) {
    const conflicts = await tx.$queryRawUnsafe<
      Array<{
        id: string;
        appointmentId: string;
        blockedFrom: Date;
        blockedTo: Date;
      }>
    >(
      `SELECT id, appointment_id AS "appointmentId", blocked_from AS "blockedFrom",
              blocked_to AS "blockedTo"
       FROM operations_resource_allocations
       WHERE ${column} = $1 AND status = 'RESERVED'
         AND blocked_from < $3 AND blocked_to > $2
       ORDER BY blocked_from ASC LIMIT 1`,
      resourceId,
      blockedFrom,
      blockedTo,
    );
    if (conflicts[0]) {
      throw new ConflictException({
        code: 'RESOURCE_TIME_CONFLICT',
        resourceId,
        conflictingAppointmentId: conflicts[0].appointmentId,
        blockedFrom: conflicts[0].blockedFrom,
        blockedTo: conflicts[0].blockedTo,
      });
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
    },
    resource: { roomId: string | null; assetId: string | null },
  ) {
    const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `INSERT INTO operations_resource_allocations (
         tenant_id, company_id, branch_id, appointment_id, room_id,
         inventory_asset_id, blocked_from, blocked_to, created_by_membership_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, appointment_id AS "appointmentId", room_id AS "roomId",
                 inventory_asset_id AS "assetId", blocked_from AS "blockedFrom",
                 blocked_to AS "blockedTo", status, version`,
      args.tenantId,
      args.companyId,
      args.branchId,
      args.appointmentId,
      resource.roomId,
      resource.assetId,
      args.blockedFrom,
      args.blockedTo,
      args.membershipId,
    );
    return rows[0];
  }
}
