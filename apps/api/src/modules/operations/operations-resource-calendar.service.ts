import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';
import type { ResourceCalendarQueryInput } from './dto/operations-resource.dto';

export type OperationsResourceCalendarEvent = {
  id: string;
  eventType: 'ALLOCATION' | 'BLOCK';
  resourceKind: 'ROOM' | 'ASSET';
  resourceId: string;
  resourceName: string;
  startsAt: Date;
  endsAt: Date;
  appointmentId: string | null;
  appointmentStartAt: Date | null;
  appointmentEndAt: Date | null;
  customerName: string | null;
  serviceName: string | null;
  reason: string | null;
  status: string;
};

@Injectable()
export class OperationsResourceCalendarService {
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

  async list(input: ResourceCalendarQueryInput) {
    const { tenantId, companyId, branchId } = this.context();

    return this.prisma.$queryRawUnsafe<OperationsResourceCalendarEvent[]>(
      `WITH allocation_events AS (
         SELECT
           ra.id,
           'ALLOCATION'::text AS "eventType",
           CASE WHEN ra.room_id IS NOT NULL THEN 'ROOM' ELSE 'ASSET' END::text AS "resourceKind",
           COALESCE(ra.room_id, ra.inventory_asset_id) AS "resourceId",
           COALESCE(r.name, ia.name) AS "resourceName",
           ra.blocked_from AS "startsAt",
           ra.blocked_to AS "endsAt",
           ap.id AS "appointmentId",
           ap."startAt" AS "appointmentStartAt",
           ap."endAt" AS "appointmentEndAt",
           trim(concat(c."firstName", ' ', c."lastName")) AS "customerName",
           s.name AS "serviceName",
           NULL::text AS reason,
           ra.status::text AS status
         FROM operations_resource_allocations ra
         JOIN appointments ap ON ap.id = ra.appointment_id
         JOIN customers c ON c.id = ap."customerId"
         JOIN services s ON s.id = ap."serviceId"
         LEFT JOIN operations_rooms r ON r.id = ra.room_id
         LEFT JOIN inventory_assets ia ON ia.id = ra.inventory_asset_id
         WHERE ra.tenant_id = $1 AND ra.company_id = $2 AND ra.branch_id = $3
           AND ra.status = 'RESERVED'
           AND ra.blocked_from < $5 AND ra.blocked_to > $4
       ), block_events AS (
         SELECT
           rb.id,
           'BLOCK'::text AS "eventType",
           CASE WHEN rb.room_id IS NOT NULL THEN 'ROOM' ELSE 'ASSET' END::text AS "resourceKind",
           COALESCE(rb.room_id, rb.inventory_asset_id) AS "resourceId",
           COALESCE(r.name, ia.name) AS "resourceName",
           rb.blocked_from AS "startsAt",
           rb.blocked_to AS "endsAt",
           NULL::text AS "appointmentId",
           NULL::timestamptz AS "appointmentStartAt",
           NULL::timestamptz AS "appointmentEndAt",
           NULL::text AS "customerName",
           NULL::text AS "serviceName",
           rb.reason,
           rb.status::text AS status
         FROM operations_resource_blocks rb
         LEFT JOIN operations_rooms r ON r.id = rb.room_id
         LEFT JOIN inventory_assets ia ON ia.id = rb.inventory_asset_id
         WHERE rb.tenant_id = $1 AND rb.company_id = $2 AND rb.branch_id = $3
           AND rb.status = 'ACTIVE'
           AND rb.blocked_from < $5 AND rb.blocked_to > $4
       )
       SELECT * FROM allocation_events
       UNION ALL
       SELECT * FROM block_events
       ORDER BY "startsAt" ASC, "resourceKind" ASC, "resourceName" ASC`,
      tenantId,
      companyId,
      branchId,
      input.from,
      input.to,
    );
  }
}
