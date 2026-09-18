import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

export type OperationsCapacityInput = {
  from: Date;
  to: Date;
};

type CapacityResourceRow = {
  resourceType: 'ROOM' | 'ASSET';
  resourceId: string;
  resourceName: string;
  category: string;
  unavailable: boolean;
};

type AllocationRow = {
  roomId: string | null;
  assetId: string | null;
  blockedFrom: Date;
  blockedTo: Date;
};

type ResourceBlockRow = {
  roomId: string | null;
  assetId: string | null;
  blockedFrom: Date;
  blockedTo: Date;
};

type TimeInterval = { from: number; to: number };

@Injectable()
export class OperationsCapacityService {
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

  private overlapMinutes(from: Date, to: Date, start: Date, end: Date) {
    const overlapFrom = Math.max(from.getTime(), start.getTime());
    const overlapTo = Math.min(to.getTime(), end.getTime());
    if (overlapFrom >= overlapTo) return 0;
    return Math.ceil((overlapTo - overlapFrom) / 60_000);
  }

  private mergedBlockedMinutes(
    intervals: ResourceBlockRow[],
    resourceId: string,
    from: Date,
    to: Date,
  ) {
    const clipped: TimeInterval[] = intervals
      .filter((item) => (item.roomId ?? item.assetId) === resourceId)
      .map((item) => ({
        from: Math.max(from.getTime(), item.blockedFrom.getTime()),
        to: Math.min(to.getTime(), item.blockedTo.getTime()),
      }))
      .filter((item) => item.from < item.to)
      .sort((left, right) => left.from - right.from);

    if (!clipped.length) return 0;

    const merged: TimeInterval[] = [];
    for (const current of clipped) {
      const previous = merged.at(-1);
      if (!previous || current.from > previous.to) {
        merged.push({ ...current });
      } else {
        previous.to = Math.max(previous.to, current.to);
      }
    }

    return merged.reduce(
      (sum, interval) => sum + Math.ceil((interval.to - interval.from) / 60_000),
      0,
    );
  }

  async summary(input: OperationsCapacityInput) {
    const { tenantId, companyId, branchId } = this.context();
    const from = input.from;
    const to = input.to;

    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException('Capacity window is invalid.');
    }

    const windowMinutes = Math.ceil((to.getTime() - from.getTime()) / 60_000);
    if (windowMinutes > 7 * 24 * 60) {
      throw new BadRequestException(
        'Capacity window cannot be longer than seven days.',
      );
    }

    const [rooms, assets, allocations, resourceBlocks] = await Promise.all([
      this.prisma.$queryRawUnsafe<CapacityResourceRow[]>(
        `SELECT 'ROOM'::text AS "resourceType", r.id AS "resourceId",
                r.name AS "resourceName", r.room_type AS category,
                (r.status <> 'AVAILABLE') AS unavailable
         FROM operations_rooms r
         WHERE r.tenant_id = $1 AND r.company_id = $2 AND r.branch_id = $3`,
        tenantId,
        companyId,
        branchId,
      ),
      this.prisma.$queryRawUnsafe<CapacityResourceRow[]>(
        `SELECT 'ASSET'::text AS "resourceType", a.id AS "resourceId",
                a.name AS "resourceName", a.asset_type AS category,
                (
                  a.status <> 'ACTIVE' OR EXISTS (
                    SELECT 1
                    FROM inventory_asset_maintenance m
                    WHERE m.asset_id = a.id
                      AND m.status IN ('PLANNED', 'IN_PROGRESS')
                      AND m.completed_at IS NULL
                      AND (m.scheduled_at IS NULL OR m.scheduled_at < $4)
                  )
                ) AS unavailable
         FROM inventory_assets a
         WHERE a.company_id = $2
           AND (a.branch_id = $3 OR a.branch_id IS NULL)`,
        tenantId,
        companyId,
        branchId,
        to,
      ),
      this.prisma.$queryRawUnsafe<AllocationRow[]>(
        `SELECT room_id AS "roomId", inventory_asset_id AS "assetId",
                blocked_from AS "blockedFrom", blocked_to AS "blockedTo"
         FROM operations_resource_allocations
         WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
           AND status = 'RESERVED'
           AND blocked_from < $5 AND blocked_to > $4`,
        tenantId,
        companyId,
        branchId,
        from,
        to,
      ),
      this.prisma.$queryRawUnsafe<ResourceBlockRow[]>(
        `SELECT room_id AS "roomId", inventory_asset_id AS "assetId",
                blocked_from AS "blockedFrom", blocked_to AS "blockedTo"
         FROM operations_resource_blocks
         WHERE tenant_id = $1 AND company_id = $2 AND branch_id = $3
           AND status = 'ACTIVE'
           AND blocked_from < $5 AND blocked_to > $4`,
        tenantId,
        companyId,
        branchId,
        from,
        to,
      ),
    ]);

    const resources = [...rooms, ...assets];
    const allocationMinutesByResource = new Map<string, number>();

    for (const allocation of allocations) {
      const resourceId = allocation.roomId ?? allocation.assetId;
      if (!resourceId) continue;

      const minutes = this.overlapMinutes(
        from,
        to,
        allocation.blockedFrom,
        allocation.blockedTo,
      );
      allocationMinutesByResource.set(
        resourceId,
        (allocationMinutesByResource.get(resourceId) ?? 0) + minutes,
      );
    }

    const resourceMetrics = resources.map((resource) => {
      const blockedMinutes = resource.unavailable
        ? windowMinutes
        : Math.min(
            windowMinutes,
            this.mergedBlockedMinutes(
              resourceBlocks,
              resource.resourceId,
              from,
              to,
            ),
          );
      const availableMinutes = resource.unavailable
        ? 0
        : Math.max(0, windowMinutes - blockedMinutes);
      const allocatedMinutes = Math.min(
        availableMinutes,
        allocationMinutesByResource.get(resource.resourceId) ?? 0,
      );
      const remainingMinutes = Math.max(
        0,
        availableMinutes - allocatedMinutes,
      );
      const utilizationPercent =
        availableMinutes === 0
          ? 0
          : Math.round((allocatedMinutes / availableMinutes) * 10_000) / 100;

      return {
        ...resource,
        windowMinutes,
        blockedMinutes,
        capacityMinutes: availableMinutes,
        allocatedMinutes,
        remainingMinutes,
        utilizationPercent,
      };
    });

    const grouped = new Map<
      string,
      {
        resourceType: 'ROOM' | 'ASSET';
        category: string;
        totalResources: number;
        unavailableResources: number;
        blockedMinutes: number;
        capacityMinutes: number;
        allocatedMinutes: number;
        remainingMinutes: number;
      }
    >();

    for (const metric of resourceMetrics) {
      const key = `${metric.resourceType}:${metric.category}`;
      const current = grouped.get(key) ?? {
        resourceType: metric.resourceType,
        category: metric.category,
        totalResources: 0,
        unavailableResources: 0,
        blockedMinutes: 0,
        capacityMinutes: 0,
        allocatedMinutes: 0,
        remainingMinutes: 0,
      };
      current.totalResources += 1;
      current.unavailableResources += metric.unavailable ? 1 : 0;
      current.blockedMinutes += metric.blockedMinutes;
      current.capacityMinutes += metric.capacityMinutes;
      current.allocatedMinutes += metric.allocatedMinutes;
      current.remainingMinutes += metric.remainingMinutes;
      grouped.set(key, current);
    }

    const categories = Array.from(grouped.values()).map((group) => ({
      ...group,
      utilizationPercent:
        group.capacityMinutes === 0
          ? 0
          : Math.round((group.allocatedMinutes / group.capacityMinutes) * 10_000) /
            100,
    }));

    const bottlenecks = categories
      .filter(
        (group) => group.capacityMinutes === 0 || group.utilizationPercent >= 80,
      )
      .sort((left, right) => right.utilizationPercent - left.utilizationPercent)
      .map((group) => ({
        resourceType: group.resourceType,
        category: group.category,
        utilizationPercent: group.utilizationPercent,
        remainingMinutes: group.remainingMinutes,
        blockedMinutes: group.blockedMinutes,
        unavailableResources: group.unavailableResources,
        reason:
          group.capacityMinutes === 0
            ? 'NO_AVAILABLE_CAPACITY'
            : group.utilizationPercent >= 95
              ? 'CRITICAL_UTILIZATION'
              : 'HIGH_UTILIZATION',
      }));

    const totalCapacityMinutes = categories.reduce(
      (sum, group) => sum + group.capacityMinutes,
      0,
    );
    const totalAllocatedMinutes = categories.reduce(
      (sum, group) => sum + group.allocatedMinutes,
      0,
    );
    const totalBlockedMinutes = categories.reduce(
      (sum, group) => sum + group.blockedMinutes,
      0,
    );

    return {
      from,
      to,
      windowMinutes,
      totals: {
        resources: resourceMetrics.length,
        unavailableResources: resourceMetrics.filter((item) => item.unavailable)
          .length,
        blockedMinutes: totalBlockedMinutes,
        capacityMinutes: totalCapacityMinutes,
        allocatedMinutes: totalAllocatedMinutes,
        remainingMinutes: Math.max(0, totalCapacityMinutes - totalAllocatedMinutes),
        utilizationPercent:
          totalCapacityMinutes === 0
            ? 0
            : Math.round((totalAllocatedMinutes / totalCapacityMinutes) * 10_000) /
              100,
      },
      categories,
      bottlenecks,
      resources: resourceMetrics,
    };
  }
}
