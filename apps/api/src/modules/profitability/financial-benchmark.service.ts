import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class FinancialBenchmarkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private companyId() {
    return this.tenantContext.getCompanyId();
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private median(values: number[]) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? this.round((sorted[middle - 1] + sorted[middle]) / 2)
      : sorted[middle];
  }

  async branchBenchmark() {
    const companyId = this.companyId();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH latest AS (
         SELECT DISTINCT ON (fhs.branch_id)
                fhs.branch_id,fhs.snapshot_date,fhs.health_score,fhs.health_status,fhs.metrics
         FROM financial_health_snapshots fhs
         WHERE fhs.company_id=$1::text AND fhs.branch_id IS NOT NULL
         ORDER BY fhs.branch_id,fhs.snapshot_date DESC,fhs.created_at DESC
       )
       SELECT b.id AS "branchId",b.name AS "branchName",b.code AS "branchCode",
              l.snapshot_date AS "snapshotDate",l.health_score AS "healthScore",
              l.health_status AS "healthStatus",l.metrics
       FROM branches b
       LEFT JOIN latest l ON l.branch_id=b.id
       WHERE b."companyId"=$1::text AND b.status='ACTIVE'
       ORDER BY b.name`,
      companyId,
    );

    const scored = rows.filter((row) => row.healthScore !== null);
    const scores = scored.map((row) => Number(row.healthScore));
    const averageScore = scores.length
      ? this.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
      : null;
    const medianScore = this.median(scores);
    const sortedScores = [...scores].sort((a, b) => a - b);

    const branches = rows.map((row) => {
      const healthScore = row.healthScore === null ? null : Number(row.healthScore);
      const percentile =
        healthScore === null || !sortedScores.length
          ? null
          : this.round(
              (sortedScores.filter((value) => value <= healthScore).length /
                sortedScores.length) *
                100,
            );
      return {
        branchId: row.branchId,
        branchName: row.branchName,
        branchCode: row.branchCode,
        snapshotDate: row.snapshotDate,
        healthScore,
        healthStatus: row.healthStatus,
        percentile,
        varianceFromAverage:
          healthScore === null || averageScore === null
            ? null
            : this.round(healthScore - averageScore),
        metrics: row.metrics,
      };
    });

    return {
      branchCount: rows.length,
      scoredBranchCount: scored.length,
      averageHealthScore: averageScore,
      medianHealthScore: medianScore,
      bestScore: sortedScores.length ? sortedScores[sortedScores.length - 1] : null,
      worstScore: sortedScores.length ? sortedScores[0] : null,
      branches: branches.sort((a, b) =>
        b.healthScore === null
          ? -1
          : a.healthScore === null
            ? 1
            : b.healthScore - a.healthScore,
      ),
    };
  }

  async anomalies(days = 60) {
    const companyId = this.companyId();
    const safeDays = Math.max(14, Math.min(365, Math.floor(days)));
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT fhs.branch_id AS "branchId",b.name AS "branchName",fhs.snapshot_date AS "snapshotDate",
              fhs.health_score AS "healthScore",fhs.metrics
       FROM financial_health_snapshots fhs
       LEFT JOIN branches b ON b.id=fhs.branch_id
       WHERE fhs.company_id=$1::text
         AND fhs.snapshot_date>=CURRENT_DATE-$2::int
       ORDER BY COALESCE(fhs.branch_id,''),fhs.snapshot_date ASC,fhs.created_at ASC`,
      companyId,
      safeDays,
    );

    const groups = new Map<string, any[]>();
    for (const row of rows) {
      const key = row.branchId ?? '__COMPANY__';
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }

    const anomalies: any[] = [];
    for (const [key, series] of groups.entries()) {
      const scores = series.map((item) => Number(item.healthScore));
      if (scores.length < 4) continue;
      const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
      const variance =
        scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scores.length;
      const stdDev = Math.sqrt(variance);

      for (let index = 1; index < series.length; index += 1) {
        const current = Number(series[index].healthScore);
        const previous = Number(series[index - 1].healthScore);
        const delta = this.round(current - previous);
        const zScore = stdDev > 0 ? this.round((current - mean) / stdDev) : 0;
        const suddenDrop = delta <= -8;
        const statisticalOutlier = zScore <= -2;
        if (!suddenDrop && !statisticalOutlier) continue;

        anomalies.push({
          scope: key === '__COMPANY__' ? 'COMPANY' : 'BRANCH',
          branchId: series[index].branchId,
          branchName: series[index].branchName,
          snapshotDate: series[index].snapshotDate,
          healthScore: current,
          previousHealthScore: previous,
          scoreDelta: delta,
          zScore,
          detection: {
            suddenDrop,
            statisticalOutlier,
          },
          severity: delta <= -15 || zScore <= -3 ? 'CRITICAL' : 'WARNING',
          metrics: series[index].metrics,
        });
      }
    }

    anomalies.sort(
      (a, b) =>
        new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime(),
    );

    return {
      lookbackDays: safeDays,
      anomalyCount: anomalies.length,
      criticalCount: anomalies.filter((item) => item.severity === 'CRITICAL').length,
      warningCount: anomalies.filter((item) => item.severity === 'WARNING').length,
      anomalies,
    };
  }
}
