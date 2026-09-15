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

    const [rooms, assets, allocations] = await Promise.all([
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
    ]);

    const resources = [...rooms, ...assets];
    const allocationMinutesByResource = new Map<string, number>();

    for (const allocation of allocations) {
      const resourceId = allocation.roomId ?? allocation.assetId;
      if (!resourceId) continue;

      const overlapFrom = Math.max(from.getTime(), allocation.blockedFrom.getTime());
      const overlapTo = Math.min(to.getTime(), allocation.blockedTo.getTime());
      if (overlapFrom >= overlapTo) continue;

      const minutes = Math.ceil((overlapTo - overlapFrom) / 60_000);
      allocationMinutesByResource.set(
        resourceId,
        (allocationMinutesByResource.get(resourceId) ?? 0) + minutes,
      );
    }

    const resourceMetrics = resources.map((resource) => {
      const allocatedMinutes = Math.min(
        windowMinutes,
        allocationMinutesByResource.get(resource.resourceId) ?? 0,
      );
      const availableMinutes = resource.unavailable ? 0 : windowMinutes;
      const effectiveAllocatedMinutes = resource.unavailable
        ? 0
        : allocatedMinutes;
      const remainingMinutes = Math.max(
        0,
        availableMinutes - effectiveAllocatedMinutes,
      );
      const utilizationPercent =
        availableMinutes === 0
          ? 0
          : Math.round((effectiveAllocatedMinutes / availableMinutes) * 10_000) /
            100;

      return {
        ...resource,
        windowMinutes,
        allocatedMinutes: effectiveAllocatedMinutes,
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
        capacityMinutes: 0,
        allocatedMinutes: 0,
        remainingMinutes: 0,
      };
      current.totalResources += 1;
      current.unavailableResources += metric.unavailable ? 1 : 0;
      current.capacityMinutes += metric.unavailable ? 0 : windowMinutes;
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
      .filter((group) => group.capacityMinutes === 0 || group.utilizationPercent >= 80)
      .sort((left, right) => right.utilizationPercent - left.utilizationPercent)
      .map((group) => ({
        resourceType: group.resourceType,
        category: group.category,
        utilizationPercent: group.utilizationPercent,
        remainingMinutes: group.remainingMinutes,
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

    return {
      from,
      to,
      windowMinutes,
      totals: {
        resources: resourceMetrics.length,
        unavailableResources: resourceMetrics.filter((item) => item.unavailable)
          .length,
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
