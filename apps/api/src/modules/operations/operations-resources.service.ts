import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import type {
  CreateRoomInput,
  UpdateRoomStatusInput,
  UpsertServiceOperationalRequirementInput,
} from './dto/operations-resource.dto';

@Injectable()
export class OperationsResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.tenantContext.getBranchId();

    if (!tenantId || !companyId) {
      throw new InternalServerErrorException(
        'Organization context is incomplete.',
      );
    }
    if (!branchId) {
      throw new BadRequestException(
        'A branch must be selected for this operation.',
      );
    }

    return { tenantId, companyId, branchId };
  }

  async listRooms() {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        code: string;
        name: string;
        roomType: string;
        status: string;
        capacity: number;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(
      `SELECT id, code, name, room_type AS "roomType", status, capacity, notes,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM operations_rooms
       WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
       ORDER BY name ASC`,
      tenantId,
      companyId,
      branchId,
    );
  }

  async createRoom(input: CreateRoomInput) {
    const { tenantId, companyId, branchId } = this.context();
    const existing = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM operations_rooms
       WHERE branch_id = $1 AND code = $2
       LIMIT 1`,
      branchId,
      input.code,
    );
    if (existing.length) {
      throw new BadRequestException('Room code already exists in this branch.');
    }

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        code: string;
        name: string;
        roomType: string;
        status: string;
        capacity: number;
        notes: string | null;
      }>
    >(
      `INSERT INTO operations_rooms (
         tenant_id, company_id, branch_id, code, name, room_type, capacity, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, code, name, room_type AS "roomType", status, capacity, notes`,
      tenantId,
      companyId,
      branchId,
      input.code,
      input.name,
      input.roomType,
      input.capacity,
      input.notes ?? null,
    );
    return rows[0];
  }

  async updateRoomStatus(id: string, input: UpdateRoomStatusInput) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; status: string; updatedAt: Date }>
    >(
      `UPDATE operations_rooms
       SET status = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND branch_id = $4
       RETURNING id, status, updated_at AS "updatedAt"`,
      id,
      tenantId,
      companyId,
      branchId,
      input.status,
    );
    if (!rows[0]) throw new NotFoundException('Room not found');
    return rows[0];
  }

  async listAvailableAssets() {
    const { companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        assetCode: string;
        name: string;
        assetType: string;
        brand: string | null;
        model: string | null;
        branchId: string | null;
        nextMaintenanceAt: Date | null;
        maintenanceBlocked: boolean;
      }>
    >(
      `SELECT a.id, a.asset_code AS "assetCode", a.name,
              a.asset_type AS "assetType", a.brand, a.model,
              a.branch_id AS "branchId", a.next_maintenance_at AS "nextMaintenanceAt",
              EXISTS (
                SELECT 1 FROM inventory_asset_maintenance m
                WHERE m.asset_id = a.id
                  AND m.status IN ('PLANNED', 'IN_PROGRESS')
                  AND (m.scheduled_at IS NULL OR m.scheduled_at <= CURRENT_TIMESTAMP)
                  AND m.completed_at IS NULL
              ) AS "maintenanceBlocked"
       FROM inventory_assets a
       WHERE a.company_id = $1
         AND a.status = 'ACTIVE'
         AND (a.branch_id = $2 OR a.branch_id IS NULL)
       ORDER BY a.asset_type, a.name`,
      companyId,
      branchId,
    );
  }

  async getServiceRequirement(serviceId: string) {
    const { tenantId, branchId } = this.context();
    await this.requireService(serviceId, tenantId, branchId);

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        serviceId: string;
        roomType: string | null;
        requiredAssetType: string | null;
        requiredAssetId: string | null;
        prepDurationMinutes: number;
        cleanupDurationMinutes: number;
      }>
    >(
      `SELECT service_id AS "serviceId", room_type AS "roomType",
              required_asset_type AS "requiredAssetType",
              required_asset_id AS "requiredAssetId",
              prep_duration_minutes AS "prepDurationMinutes",
              cleanup_duration_minutes AS "cleanupDurationMinutes"
       FROM service_operational_requirements
       WHERE service_id = $1 AND tenant_id = $2 AND branch_id = $3
       LIMIT 1`,
      serviceId,
      tenantId,
      branchId,
    );

    return (
      rows[0] ?? {
        serviceId,
        roomType: null,
        requiredAssetType: null,
        requiredAssetId: null,
        prepDurationMinutes: 0,
        cleanupDurationMinutes: 0,
      }
    );
  }

  async upsertServiceRequirement(
    serviceId: string,
    input: UpsertServiceOperationalRequirementInput,
  ) {
    const { tenantId, companyId, branchId } = this.context();
    await this.requireService(serviceId, tenantId, branchId);

    if (input.requiredAssetId) {
      const assets = await this.prisma.$queryRawUnsafe<
        Array<{ id: string; assetType: string }>
      >(
        `SELECT id, asset_type AS "assetType"
         FROM inventory_assets
         WHERE id = $1 AND company_id = $2 AND status = 'ACTIVE'
           AND (branch_id = $3 OR branch_id IS NULL)
         LIMIT 1`,
        input.requiredAssetId,
        companyId,
        branchId,
      );
      if (!assets[0]) {
        throw new BadRequestException(
          'Required asset is outside the active branch or is not active.',
        );
      }
    }

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        serviceId: string;
        roomType: string | null;
        requiredAssetType: string | null;
        requiredAssetId: string | null;
        prepDurationMinutes: number;
        cleanupDurationMinutes: number;
      }>
    >(
      `INSERT INTO service_operational_requirements (
         service_id, tenant_id, branch_id, room_type, required_asset_type,
         required_asset_id, prep_duration_minutes, cleanup_duration_minutes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (service_id) DO UPDATE SET
         room_type = EXCLUDED.room_type,
         required_asset_type = EXCLUDED.required_asset_type,
         required_asset_id = EXCLUDED.required_asset_id,
         prep_duration_minutes = EXCLUDED.prep_duration_minutes,
         cleanup_duration_minutes = EXCLUDED.cleanup_duration_minutes,
         updated_at = CURRENT_TIMESTAMP
       RETURNING service_id AS "serviceId", room_type AS "roomType",
                 required_asset_type AS "requiredAssetType",
                 required_asset_id AS "requiredAssetId",
                 prep_duration_minutes AS "prepDurationMinutes",
                 cleanup_duration_minutes AS "cleanupDurationMinutes"`,
      serviceId,
      tenantId,
      branchId,
      input.roomType ?? null,
      input.requiredAssetType ?? null,
      input.requiredAssetId ?? null,
      input.prepDurationMinutes,
      input.cleanupDurationMinutes,
    );
    return rows[0];
  }

  private async requireService(
    serviceId: string,
    tenantId: string,
    branchId: string,
  ) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, tenantId, branchId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }
}
