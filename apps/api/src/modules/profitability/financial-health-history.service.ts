import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { FinancialHealthService } from './financial-health.service';
import { CfoDashboardQuery } from './cfo-dashboard.service';

@Injectable()
export class FinancialHealthHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly health: FinancialHealthService,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private startOfDay(value: Date) {
    const result = new Date(value);
    result.setUTCHours(0, 0, 0, 0);
    return result;
  }

  private addDays(value: Date, days: number) {
    const result = new Date(value);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async capture(query: CfoDashboardQuery = {}) {
    const score = await this.health.score(query);
    const { tenantId, companyId, branchId } = this.context();
    const snapshotDate = this.startOfDay(score.asOf);
    const metrics = {
      openingLiquidity: score.cfoSnapshot.liquidity.opening,
      thirteenWeekClosing: score.cfoSnapshot.liquidity.thirteenWeekClosing,
      thirteenWeekLowest: score.cfoSnapshot.liquidity.thirteenWeekLowest,
      projectedNetCashFlow: score.cfoSnapshot.liquidity.projectedNetCashFlow,
      runwayWeeks: score.cfoSnapshot.runway.runwayWeeks,
      netWorkingCapital: score.cfoSnapshot.workingCapital.netWorkingCapital,
      dsoDays: score.cfoSnapshot.workingCapital.dsoDays,
      dpoDays: score.cfoSnapshot.workingCapital.dpoDays,
      overdueOutstanding: score.cfoSnapshot.receivablesRisk.overdueOutstanding,
      overdueReceivableRatioPercent: score.overdueReceivableRatioPercent,
      liquidityAlertCount: score.cfoSnapshot.treasuryAlerts.alertCount,
    };

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO financial_health_snapshots(
         id,tenant_id,company_id,branch_id,snapshot_date,lookback_days,health_score,
         health_status,component_scores,covenant_summary,executive_alerts,metrics,created_at
       ) VALUES(
         $1::text,$2::text,$3::text,$4::text,$5::date,$6,$7,$8::text,
         $9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,NOW()
       )
       ON CONFLICT(company_id,(COALESCE(branch_id,'')),snapshot_date,lookback_days)
       DO UPDATE SET health_score=EXCLUDED.health_score,
                     health_status=EXCLUDED.health_status,
                     component_scores=EXCLUDED.component_scores,
                     covenant_summary=EXCLUDED.covenant_summary,
                     executive_alerts=EXCLUDED.executive_alerts,
                     metrics=EXCLUDED.metrics,
                     created_at=NOW()
       RETURNING id,snapshot_date AS "snapshotDate",lookback_days AS "lookbackDays",
                 health_score AS "healthScore",health_status AS "healthStatus",created_at AS "createdAt"`,
      randomUUID(),
      tenantId,
      companyId,
      branchId,
      snapshotDate,
      score.lookbackDays,
      score.healthScore,
      score.healthStatus,
      JSON.stringify(score.componentScores),
      JSON.stringify(score.covenantSummary),
      JSON.stringify(score.executiveAlerts),
      JSON.stringify(metrics),
    );

    return {
      ...rows[0],
      healthScore: Number(rows[0].healthScore),
      componentScores: score.componentScores,
      covenantSummary: score.covenantSummary,
      executiveAlerts: score.executiveAlerts,
      metrics,
    };
  }

  async history(fromInput?: Date, toInput?: Date, limit = 180) {
    const { companyId, branchId } = this.context();
    const to = this.startOfDay(toInput ?? new Date());
    const from = this.startOfDay(fromInput ?? this.addDays(to, -180));
    const safeLimit = Math.max(1, Math.min(730, Math.floor(limit)));

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,snapshot_date AS "snapshotDate",lookback_days AS "lookbackDays",
              health_score AS "healthScore",health_status AS "healthStatus",
              component_scores AS "componentScores",covenant_summary AS "covenantSummary",
              executive_alerts AS "executiveAlerts",metrics,created_at AS "createdAt"
       FROM financial_health_snapshots
       WHERE company_id=$1::text
         AND COALESCE(branch_id,'')=COALESCE($2::text,'')
         AND snapshot_date>=$3::date
         AND snapshot_date<=$4::date
       ORDER BY snapshot_date ASC,created_at ASC
       LIMIT $5`,
      companyId,
      branchId,
      from,
      to,
      safeLimit,
    );

    return rows.map((row) => ({
      ...row,
      healthScore: Number(row.healthScore),
    }));
  }

  async trend(query: CfoDashboardQuery = {}) {
    const asOf = this.startOfDay(query.asOf ?? new Date());
    const lookbackDays = query.lookbackDays ?? 90;
    const current = await this.capture({ asOf, lookbackDays });
    const history = await this.history(this.addDays(asOf, -120), asOf, 180);

    const previous = [...history]
      .reverse()
      .find((item) => new Date(item.snapshotDate).getTime() < asOf.getTime());
    const previousMonthTarget = this.addDays(asOf, -30);
    const monthAgo = [...history]
      .filter((item) => new Date(item.snapshotDate).getTime() <= previousMonthTarget.getTime())
      .reverse()[0];

    const scoreDelta = previous
      ? this.round(current.healthScore - previous.healthScore)
      : null;
    const monthOverMonthDelta = monthAgo
      ? this.round(current.healthScore - monthAgo.healthScore)
      : null;

    const recentScores = history.slice(-7).map((item) => Number(item.healthScore));
    const averageRecentScore = recentScores.length
      ? this.round(recentScores.reduce((sum, value) => sum + value, 0) / recentScores.length)
      : current.healthScore;

    return {
      asOf,
      currentScore: current.healthScore,
      currentStatus: current.healthStatus,
      previousScore: previous?.healthScore ?? null,
      scoreDelta,
      monthAgoScore: monthAgo?.healthScore ?? null,
      monthOverMonthDelta,
      averageRecentScore,
      direction:
        monthOverMonthDelta === null
          ? 'INSUFFICIENT_HISTORY'
          : monthOverMonthDelta > 2
            ? 'IMPROVING'
            : monthOverMonthDelta < -2
              ? 'DETERIORATING'
              : 'STABLE',
      history,
    };
  }

  async recommendations(query: CfoDashboardQuery = {}) {
    const score = await this.health.score(query);
    const recommendations = score.covenants
      .filter((item) => !item.compliant)
      .map((item) => {
        switch (item.code) {
          case 'HEALTH_SCORE':
            return {
              code: item.code,
              priority: 'CRITICAL',
              action: 'FINANCIAL_RECOVERY_PLAN',
              recommendation:
                'Initiate a financial recovery plan and review liquidity, collections, cost controls and near-term commitments weekly.',
            };
          case 'RUNWAY_WEEKS':
            return {
              code: item.code,
              priority: 'CRITICAL',
              action: 'EXTEND_RUNWAY',
              recommendation:
                'Protect cash immediately: defer non-essential outflows, accelerate collections and preserve the configured liquidity floor.',
            };
          case 'LIQUIDITY_ALERTS':
            return {
              code: item.code,
              priority: 'CRITICAL',
              action: 'RESOLVE_LIQUIDITY_GAP',
              recommendation:
                'Review the first forecasted liquidity breach week and reschedule supplier payments or accelerate receivable collection before that date.',
            };
          case 'DSO_DAYS':
            return {
              code: item.code,
              priority: 'HIGH',
              action: 'ACCELERATE_COLLECTIONS',
              recommendation:
                'Prioritize overdue customer balances, shorten payment terms for new sales and follow up before installment due dates.',
            };
          case 'NET_WORKING_CAPITAL':
            return {
              code: item.code,
              priority: 'HIGH',
              action: 'IMPROVE_WORKING_CAPITAL',
              recommendation:
                'Reduce inventory tied-up cash, accelerate receivables and renegotiate supplier terms to restore working-capital headroom.',
            };
          case 'OVERDUE_RECEIVABLE_RATIO':
            return {
              code: item.code,
              priority: 'HIGH',
              action: 'REDUCE_OVERDUE_RECEIVABLES',
              recommendation:
                'Segment overdue balances by aging and customer exposure, then prioritize high-value and 90+ day accounts for collection.',
            };
          default:
            return {
              code: item.code,
              priority: 'MEDIUM',
              action: 'REVIEW',
              recommendation: 'Review the breached financial threshold and assign a corrective action owner.',
            };
        }
      });

    return {
      asOf: score.asOf,
      healthScore: score.healthScore,
      healthStatus: score.healthStatus,
      recommendationCount: recommendations.length,
      recommendations,
    };
  }
}
