import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CfoDashboardQuery } from './cfo-dashboard.service';
import { FinancialHealthHistoryService } from './financial-health-history.service';
import { FinancialHealthService } from './financial-health.service';

@Injectable()
export class ExecutiveFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly history: FinancialHealthHistoryService,
    private readonly health: FinancialHealthService,
  ) {}

  private context() {
    return {
      companyId: this.tenantContext.getCompanyId(),
    };
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async branchRanking(limit = 50) {
    const { companyId } = this.context();
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH ranked_snapshots AS (
         SELECT fhs.branch_id,
                fhs.snapshot_date,
                fhs.health_score,
                fhs.health_status,
                fhs.metrics,
                ROW_NUMBER() OVER(
                  PARTITION BY fhs.branch_id
                  ORDER BY fhs.snapshot_date DESC,fhs.created_at DESC
                ) AS rn
         FROM financial_health_snapshots fhs
         WHERE fhs.company_id=$1::text
           AND fhs.branch_id IS NOT NULL
       ), latest AS (
         SELECT branch_id,
                MAX(CASE WHEN rn=1 THEN snapshot_date END) AS snapshot_date,
                MAX(CASE WHEN rn=1 THEN health_score END) AS current_score,
                MAX(CASE WHEN rn=2 THEN health_score END) AS previous_score,
                MAX(CASE WHEN rn=1 THEN health_status END) AS health_status,
                MAX(CASE WHEN rn=1 THEN metrics::text END)::jsonb AS metrics
         FROM ranked_snapshots
         WHERE rn<=2
         GROUP BY branch_id
       )
       SELECT b.id AS "branchId",b.name AS "branchName",b.code AS "branchCode",
              l.snapshot_date AS "snapshotDate",l.current_score AS "currentScore",
              l.previous_score AS "previousScore",l.health_status AS "healthStatus",
              l.metrics
       FROM branches b
       LEFT JOIN latest l ON l.branch_id=b.id
       WHERE b."companyId"=$1::text AND b.status='ACTIVE'
       ORDER BY l.current_score DESC NULLS LAST,b.name ASC
       LIMIT $2`,
      companyId,
      safeLimit,
    );

    return rows.map((row, index) => {
      const currentScore = row.currentScore === null ? null : Number(row.currentScore);
      const previousScore = row.previousScore === null ? null : Number(row.previousScore);
      const scoreDelta =
        currentScore !== null && previousScore !== null
          ? this.round(currentScore - previousScore)
          : null;
      return {
        rank: currentScore === null ? null : index + 1,
        branchId: row.branchId,
        branchName: row.branchName,
        branchCode: row.branchCode,
        snapshotDate: row.snapshotDate,
        currentScore,
        previousScore,
        scoreDelta,
        direction:
          scoreDelta === null
            ? 'INSUFFICIENT_HISTORY'
            : scoreDelta > 2
              ? 'IMPROVING'
              : scoreDelta < -2
                ? 'DETERIORATING'
                : 'STABLE',
        healthStatus: row.healthStatus,
        metrics: row.metrics,
      };
    });
  }

  async trendAlerts(query: CfoDashboardQuery = {}) {
    const [trend, ranking] = await Promise.all([
      this.history.trend(query),
      this.branchRanking(200),
    ]);

    const alerts: Array<Record<string, unknown>> = [];
    if (trend.direction === 'DETERIORATING') {
      alerts.push({
        code: 'COMPANY_HEALTH_DETERIORATING',
        severity:
          trend.monthOverMonthDelta !== null && trend.monthOverMonthDelta <= -10
            ? 'CRITICAL'
            : 'WARNING',
        scoreDelta: trend.scoreDelta,
        monthOverMonthDelta: trend.monthOverMonthDelta,
        currentScore: trend.currentScore,
      });
    }

    for (const branch of ranking) {
      if (
        branch.direction === 'DETERIORATING' &&
        branch.scoreDelta !== null &&
        branch.scoreDelta <= -5
      ) {
        alerts.push({
          code: 'BRANCH_HEALTH_DETERIORATING',
          severity: branch.scoreDelta <= -10 ? 'CRITICAL' : 'WARNING',
          branchId: branch.branchId,
          branchName: branch.branchName,
          currentScore: branch.currentScore,
          scoreDelta: branch.scoreDelta,
        });
      }
    }

    return {
      asOf: trend.asOf,
      companyDirection: trend.direction,
      currentScore: trend.currentScore,
      monthOverMonthDelta: trend.monthOverMonthDelta,
      alertCount: alerts.length,
      alerts,
    };
  }

  async executiveSummary(query: CfoDashboardQuery = {}) {
    const [score, trend, recommendations, ranking] = await Promise.all([
      this.health.score(query),
      this.history.trend(query),
      this.history.recommendations(query),
      this.branchRanking(50),
    ]);

    const scoredBranches = ranking.filter((item) => item.currentScore !== null);
    const improvingBranches = scoredBranches.filter(
      (item) => item.direction === 'IMPROVING',
    ).length;
    const deterioratingBranches = scoredBranches.filter(
      (item) => item.direction === 'DETERIORATING',
    ).length;
    const criticalBranches = scoredBranches.filter(
      (item) => item.healthStatus === 'CRITICAL',
    );
    const weakestBranches = [...scoredBranches]
      .sort((a, b) => Number(a.currentScore) - Number(b.currentScore))
      .slice(0, 5);

    return {
      asOf: score.asOf,
      health: {
        score: score.healthScore,
        status: score.healthStatus,
        direction: trend.direction,
        scoreDelta: trend.scoreDelta,
        monthOverMonthDelta: trend.monthOverMonthDelta,
      },
      covenants: score.covenantSummary,
      liquidity: {
        opening: score.cfoSnapshot.liquidity.opening,
        thirteenWeekClosing: score.cfoSnapshot.liquidity.thirteenWeekClosing,
        thirteenWeekLowest: score.cfoSnapshot.liquidity.thirteenWeekLowest,
        risk: score.cfoSnapshot.liquidity.risk,
        runwayWeeks: score.cfoSnapshot.runway.runwayWeeks,
      },
      workingCapital: {
        netWorkingCapital: score.cfoSnapshot.workingCapital.netWorkingCapital,
        dsoDays: score.cfoSnapshot.workingCapital.dsoDays,
        dpoDays: score.cfoSnapshot.workingCapital.dpoDays,
        overdueReceivableRatioPercent: score.overdueReceivableRatioPercent,
      },
      branchPortfolio: {
        activeScoredBranches: scoredBranches.length,
        improvingBranches,
        deterioratingBranches,
        criticalBranches: criticalBranches.length,
        weakestBranches,
      },
      priorities: recommendations.recommendations.slice(0, 8),
      executiveAlerts: score.executiveAlerts,
    };
  }
}
