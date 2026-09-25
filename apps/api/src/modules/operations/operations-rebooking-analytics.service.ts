import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from '@beauty-erp/database';

import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class OperationsRebookingAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.tenantContext.getBranchId();
    if (!tenantId) {
      throw new InternalServerErrorException('Tenant context is missing.');
    }
    if (!branchId) {
      throw new BadRequestException('A branch must be selected for this operation.');
    }
    return { tenantId, branchId };
  }

  async summary(days = 90) {
    const { tenantId, branchId } = this.context();
    const safeDays = Math.min(Math.max(Math.trunc(days), 1), 365);

    const [totals, byService, byStaff] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        Array<{
          eligibleCompleted: number;
          rebooked: number;
          recommendedTracked: number;
          avgDeviationDays: number | null;
        }>
      >(
        `WITH eligible AS (
           SELECT a.id
           FROM appointments a
           WHERE a."tenantId" = $1 AND a."branchId" = $2
             AND a.status::text = 'COMPLETED'
             AND a."endAt" >= CURRENT_TIMESTAMP - ($3::int * INTERVAL '1 day')
         ), tracked AS (
           SELECT rb.*
           FROM operations_rebookings rb
           JOIN eligible e ON e.id = rb.source_appointment_id
           WHERE rb.tenant_id = $1 AND rb.branch_id = $2
         )
         SELECT
           (SELECT COUNT(*)::int FROM eligible) AS "eligibleCompleted",
           COUNT(*)::int AS rebooked,
           COUNT(*) FILTER (WHERE recommended_start_at IS NOT NULL)::int AS "recommendedTracked",
           AVG(EXTRACT(EPOCH FROM (actual_start_at - recommended_start_at)) / 86400.0)
             FILTER (WHERE recommended_start_at IS NOT NULL) AS "avgDeviationDays"
         FROM tracked`,
        tenantId,
        branchId,
        safeDays,
      ),
      this.prisma.$queryRawUnsafe<
        Array<{ serviceId: string; serviceName: string; rebooked: number }>
      >(
        `SELECT rb.service_id AS "serviceId", s.name AS "serviceName", COUNT(*)::int AS rebooked
         FROM operations_rebookings rb
         JOIN services s ON s.id = rb.service_id
         WHERE rb.tenant_id = $1 AND rb.branch_id = $2
           AND rb.created_at >= CURRENT_TIMESTAMP - ($3::int * INTERVAL '1 day')
         GROUP BY rb.service_id, s.name
         ORDER BY rebooked DESC, s.name ASC
         LIMIT 20`,
        tenantId,
        branchId,
        safeDays,
      ),
      this.prisma.$queryRawUnsafe<
        Array<{ staffId: string; staffName: string; rebooked: number }>
      >(
        `SELECT rb.target_staff_id AS "staffId",
                trim(concat(st."firstName", ' ', st."lastName")) AS "staffName",
                COUNT(*)::int AS rebooked
         FROM operations_rebookings rb
         JOIN staff st ON st.id = rb.target_staff_id
         WHERE rb.tenant_id = $1 AND rb.branch_id = $2
           AND rb.created_at >= CURRENT_TIMESTAMP - ($3::int * INTERVAL '1 day')
         GROUP BY rb.target_staff_id, st."firstName", st."lastName"
         ORDER BY rebooked DESC, "staffName" ASC
         LIMIT 20`,
        tenantId,
        branchId,
        safeDays,
      ),
    ]);

    const total = totals[0] ?? {
      eligibleCompleted: 0,
      rebooked: 0,
      recommendedTracked: 0,
      avgDeviationDays: null,
    };

    return {
      windowDays: safeDays,
      ...total,
      rebookingRate:
        total.eligibleCompleted > 0
          ? Number(((total.rebooked / total.eligibleCompleted) * 100).toFixed(1))
          : 0,
      avgDeviationDays:
        total.avgDeviationDays === null
          ? null
          : Number(Number(total.avgDeviationDays).toFixed(1)),
      byService,
      byStaff,
    };
  }
}
