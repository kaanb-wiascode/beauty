import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CfoDashboardService, CfoDashboardQuery } from './cfo-dashboard.service';

export interface FinancialHealthThresholdInput {
  minimumHealthScore?: number;
  minimumRunwayWeeks?: number;
  maximumDsoDays?: number;
  minimumNetWorkingCapital?: number;
  maximumOverdueReceivableRatio?: number;
  maximumLiquidityAlerts?: number;
}

@Injectable()
export class FinancialHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly cfo: CfoDashboardService,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private clampScore(value: number) {
    return Math.max(0, Math.min(100, this.round(value)));
  }

  async getThresholds() {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,
              company_id AS "companyId",
              branch_id AS "branchId",
              minimum_health_score AS "minimumHealthScore",
              minimum_runway_weeks AS "minimumRunwayWeeks",
              maximum_dso_days AS "maximumDsoDays",
              minimum_net_working_capital AS "minimumNetWorkingCapital",
              maximum_overdue_receivable_ratio AS "maximumOverdueReceivableRatio",
              maximum_liquidity_alerts AS "maximumLiquidityAlerts",
              updated_at AS "updatedAt"
       FROM financial_health_thresholds
       WHERE company_id=$1::text
         AND COALESCE(branch_id,'')=COALESCE($2::text,'')
       LIMIT 1`,
      companyId,
      branchId,
    );

    if (!rows.length) {
      return {
        companyId,
        branchId,
        minimumHealthScore: 60,
        minimumRunwayWeeks: 8,
        maximumDsoDays: 45,
        minimumNetWorkingCapital: 0,
        maximumOverdueReceivableRatio: 20,
        maximumLiquidityAlerts: 0,
        configured: false,
      };
    }

    const row = rows[0];
    return {
      ...row,
      minimumHealthScore: Number(row.minimumHealthScore),
      minimumRunwayWeeks: Number(row.minimumRunwayWeeks),
      maximumDsoDays: Number(row.maximumDsoDays),
      minimumNetWorkingCapital: Number(row.minimumNetWorkingCapital),
      maximumOverdueReceivableRatio: Number(row.maximumOverdueReceivableRatio),
      maximumLiquidityAlerts: Number(row.maximumLiquidityAlerts),
      configured: true,
    };
  }

  async setThresholds(input: FinancialHealthThresholdInput) {
    const current = await this.getThresholds();
    const { tenantId, companyId, branchId } = this.context();
    const values = {
      minimumHealthScore: Number(input.minimumHealthScore ?? current.minimumHealthScore),
      minimumRunwayWeeks: Number(input.minimumRunwayWeeks ?? current.minimumRunwayWeeks),
      maximumDsoDays: Number(input.maximumDsoDays ?? current.maximumDsoDays),
      minimumNetWorkingCapital: Number(
        input.minimumNetWorkingCapital ?? current.minimumNetWorkingCapital,
      ),
      maximumOverdueReceivableRatio: Number(
        input.maximumOverdueReceivableRatio ?? current.maximumOverdueReceivableRatio,
      ),
      maximumLiquidityAlerts: Number(
        input.maximumLiquidityAlerts ?? current.maximumLiquidityAlerts,
      ),
    };

    if (values.minimumHealthScore < 0 || values.minimumHealthScore > 100) {
      throw new BadRequestException('minimumHealthScore must be between 0 and 100.');
    }
    if (values.minimumRunwayWeeks < 0 || values.maximumDsoDays < 0) {
      throw new BadRequestException('Runway and DSO thresholds must be zero or greater.');
    }
    if (
      values.maximumOverdueReceivableRatio < 0 ||
      values.maximumOverdueReceivableRatio > 100
    ) {
      throw new BadRequestException(
        'maximumOverdueReceivableRatio must be between 0 and 100.',
      );
    }
    if (
      !Number.isInteger(values.maximumLiquidityAlerts) ||
      values.maximumLiquidityAlerts < 0
    ) {
      throw new BadRequestException(
        'maximumLiquidityAlerts must be a non-negative integer.',
      );
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO financial_health_thresholds(
         id,tenant_id,company_id,branch_id,minimum_health_score,minimum_runway_weeks,
         maximum_dso_days,minimum_net_working_capital,maximum_overdue_receivable_ratio,
         maximum_liquidity_alerts,created_at,updated_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,$8,$9,$10,NOW(),NOW())
       ON CONFLICT(company_id,(COALESCE(branch_id,'')))
       DO UPDATE SET minimum_health_score=EXCLUDED.minimum_health_score,
                     minimum_runway_weeks=EXCLUDED.minimum_runway_weeks,
                     maximum_dso_days=EXCLUDED.maximum_dso_days,
                     minimum_net_working_capital=EXCLUDED.minimum_net_working_capital,
                     maximum_overdue_receivable_ratio=EXCLUDED.maximum_overdue_receivable_ratio,
                     maximum_liquidity_alerts=EXCLUDED.maximum_liquidity_alerts,
                     updated_at=NOW()
       RETURNING id`,
      current.configured ? current.id : randomUUID(),
      tenantId,
      companyId,
      branchId,
      values.minimumHealthScore,
      values.minimumRunwayWeeks,
      values.maximumDsoDays,
      values.minimumNetWorkingCapital,
      values.maximumOverdueReceivableRatio,
      values.maximumLiquidityAlerts,
    );

    return this.getThresholds();
  }

  private scoreRunway(runwayWeeks: number | null) {
    if (runwayWeeks === null) return 100;
    if (runwayWeeks >= 12) return 100;
    if (runwayWeeks >= 8) return 80;
    if (runwayWeeks >= 4) return 50;
    return 15;
  }

  private scoreDso(dso: number | null) {
    if (dso === null) return 70;
    if (dso <= 20) return 100;
    if (dso <= 30) return 85;
    if (dso <= 45) return 65;
    if (dso <= 60) return 40;
    return 15;
  }

  async score(query: CfoDashboardQuery = {}) {
    const [dashboard, thresholds] = await Promise.all([
      this.cfo.dashboard(query),
      this.getThresholds(),
    ]);

    const revenueBase = Math.max(Number(dashboard.workingCapital.periodSales ?? 0), 1);
    const overdueRatio = this.round(
      (Number(dashboard.receivablesRisk.overdueOutstanding ?? 0) / revenueBase) * 100,
    );

    const componentScores = {
      liquidity: dashboard.liquidity.risk
        ? dashboard.liquidity.thirteenWeekLowest < 0
          ? 0
          : 45
        : 100,
      runway: this.scoreRunway(dashboard.runway.runwayWeeks),
      workingCapital:
        dashboard.workingCapital.netWorkingCapital >= 0
          ? 100
          : dashboard.workingCapital.netWorkingCapital >=
              -Math.max(dashboard.workingCapital.periodSales * 0.1, 1)
            ? 55
            : 15,
      dso: this.scoreDso(dashboard.workingCapital.dsoDays),
      receivables:
        overdueRatio <= 5 ? 100 : overdueRatio <= 10 ? 80 : overdueRatio <= 20 ? 55 : 20,
      forecast:
        dashboard.liquidity.projectedNetCashFlow >= 0
          ? 100
          : dashboard.liquidity.thirteenWeekClosing > 0
            ? 60
            : 10,
    };

    const weights = {
      liquidity: 0.25,
      runway: 0.2,
      workingCapital: 0.2,
      dso: 0.15,
      receivables: 0.1,
      forecast: 0.1,
    };

    const healthScore = this.clampScore(
      Object.entries(componentScores).reduce(
        (sum, [key, value]) => sum + value * weights[key as keyof typeof weights],
        0,
      ),
    );

    const covenants = [
      {
        code: 'HEALTH_SCORE',
        label: 'Minimum financial health score',
        actual: healthScore,
        threshold: thresholds.minimumHealthScore,
        operator: '>=',
        compliant: healthScore >= thresholds.minimumHealthScore,
      },
      {
        code: 'RUNWAY_WEEKS',
        label: 'Minimum cash runway',
        actual: dashboard.runway.runwayWeeks,
        threshold: thresholds.minimumRunwayWeeks,
        operator: '>=',
        compliant:
          dashboard.runway.runwayWeeks === null ||
          dashboard.runway.runwayWeeks >= thresholds.minimumRunwayWeeks,
      },
      {
        code: 'DSO_DAYS',
        label: 'Maximum DSO',
        actual: dashboard.workingCapital.dsoDays,
        threshold: thresholds.maximumDsoDays,
        operator: '<=',
        compliant:
          dashboard.workingCapital.dsoDays === null ||
          dashboard.workingCapital.dsoDays <= thresholds.maximumDsoDays,
      },
      {
        code: 'NET_WORKING_CAPITAL',
        label: 'Minimum net working capital',
        actual: dashboard.workingCapital.netWorkingCapital,
        threshold: thresholds.minimumNetWorkingCapital,
        operator: '>=',
        compliant:
          dashboard.workingCapital.netWorkingCapital >= thresholds.minimumNetWorkingCapital,
      },
      {
        code: 'OVERDUE_RECEIVABLE_RATIO',
        label: 'Maximum overdue receivable ratio',
        actual: overdueRatio,
        threshold: thresholds.maximumOverdueReceivableRatio,
        operator: '<=',
        compliant: overdueRatio <= thresholds.maximumOverdueReceivableRatio,
      },
      {
        code: 'LIQUIDITY_ALERTS',
        label: 'Maximum 13-week liquidity alerts',
        actual: dashboard.treasuryAlerts.alertCount,
        threshold: thresholds.maximumLiquidityAlerts,
        operator: '<=',
        compliant:
          dashboard.treasuryAlerts.alertCount <= thresholds.maximumLiquidityAlerts,
      },
    ];

    const breaches = covenants.filter((item) => !item.compliant);
    const executiveAlerts = breaches.map((item) => ({
      code: item.code,
      severity:
        item.code === 'HEALTH_SCORE' ||
        item.code === 'RUNWAY_WEEKS' ||
        item.code === 'LIQUIDITY_ALERTS'
          ? 'CRITICAL'
          : 'WARNING',
      title: item.label,
      actual: item.actual,
      threshold: item.threshold,
      operator: item.operator,
    }));

    return {
      asOf: dashboard.asOf,
      lookbackDays: dashboard.lookbackDays,
      healthScore,
      healthStatus:
        healthScore >= 80
          ? 'STRONG'
          : healthScore >= 60
            ? 'STABLE'
            : healthScore >= 40
              ? 'WEAK'
              : 'CRITICAL',
      componentScores,
      overdueReceivableRatioPercent: overdueRatio,
      thresholds,
      covenantSummary: {
        total: covenants.length,
        compliant: covenants.length - breaches.length,
        breached: breaches.length,
        allCompliant: breaches.length === 0,
      },
      covenants,
      executiveAlerts,
      cfoSnapshot: dashboard,
    };
  }
}
