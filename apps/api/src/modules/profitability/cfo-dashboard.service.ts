import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CashFlowForecastService } from './cash-flow-forecast.service';
import { TreasuryRiskService } from './treasury-risk.service';

export interface CfoDashboardQuery {
  asOf?: Date;
  lookbackDays?: number;
}

@Injectable()
export class CfoDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly cashFlow: CashFlowForecastService,
    private readonly treasuryRisk: TreasuryRiskService,
  ) {}

  private context() {
    return { companyId: this.tenantContext.getCompanyId(), branchId: this.tenantContext.getBranchId() };
  }
  private round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
  private startOfDay(value: Date) { const result = new Date(value); result.setUTCHours(0, 0, 0, 0); return result; }
  private addDays(value: Date, days: number) { const result = new Date(value); result.setUTCDate(result.getUTCDate() + days); return result; }
  private normalizeQuery(query: CfoDashboardQuery) {
    const asOf = this.startOfDay(query.asOf ?? new Date());
    const lookbackDays = Number(query.lookbackDays ?? 90);
    if (!Number.isInteger(lookbackDays) || lookbackDays < 7 || lookbackDays > 730) throw new BadRequestException('lookbackDays must be an integer between 7 and 730.');
    return { asOf, lookbackDays, from: this.addDays(asOf, -lookbackDays) };
  }
  private async endingReceivables(asOf: Date) {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM(jel.debit-jel.credit),0)::numeric AS amount FROM journal_entry_lines jel JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED' JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.code='120' WHERE je."companyId"=$1::text AND ($2::text IS NULL OR je."branchId"=$2::text) AND je."entryDate"<$3::timestamptz`, companyId, branchId, this.addDays(asOf, 1));
    return this.round(Number(rows[0]?.amount ?? 0));
  }
  private async endingPayables(asOf: Date) {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM(jel.credit-jel.debit),0)::numeric AS amount FROM journal_entry_lines jel JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED' JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.code='320' WHERE je."companyId"=$1::text AND ($2::text IS NULL OR je."branchId"=$2::text) AND je."entryDate"<$3::timestamptz`, companyId, branchId, this.addDays(asOf, 1));
    return this.round(Number(rows[0]?.amount ?? 0));
  }
  private async inventoryValue() {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM(st.quantity*st.cost_per_unit),0)::numeric AS amount FROM inventory_stock st JOIN inventory_warehouses w ON w.id=st.warehouse_id WHERE w.company_id=$1::text AND ($2::text IS NULL OR w.branch_id=$2::text)`, companyId, branchId);
    return this.round(Number(rows[0]?.amount ?? 0));
  }
  private async periodSales(from: Date, asOf: Date) {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`WITH refunds AS (SELECT sp."saleId",COALESCE(SUM(sp.amount),0)::numeric AS refunded FROM sale_payments sp WHERE sp.status='REFUNDED' GROUP BY sp."saleId") SELECT COALESCE(SUM(GREATEST(s.total-COALESCE(r.refunded,0),0)),0)::numeric AS amount FROM sales s JOIN branches b ON b.id=s."branchId" LEFT JOIN refunds r ON r."saleId"=s.id WHERE b."companyId"=$1::text AND ($2::text IS NULL OR s."branchId"=$2::text) AND s.status='CONFIRMED' AND s."confirmedAt">=$3::timestamptz AND s."confirmedAt"<$4::timestamptz`, companyId, branchId, from, this.addDays(asOf, 1));
    return this.round(Number(rows[0]?.amount ?? 0));
  }
  private async periodPurchases(from: Date, asOf: Date) {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM(gri.quantity*gri.unit_cost),0)::numeric AS amount FROM inventory_goods_receipt_items gri JOIN inventory_goods_receipts gr ON gr.id=gri.goods_receipt_id JOIN inventory_purchase_orders po ON po.id=gr.purchase_order_id JOIN inventory_warehouses w ON w.id=po.warehouse_id WHERE gr.company_id=$1::text AND ($2::text IS NULL OR w.branch_id=$2::text) AND gr.received_at>=$3::timestamptz AND gr.received_at<$4::timestamptz`, companyId, branchId, from, this.addDays(asOf, 1));
    return this.round(Number(rows[0]?.amount ?? 0));
  }
  private async realizedCashFlow(from: Date, asOf: Date) {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM(jel.debit-jel.credit),0)::numeric AS net_change FROM journal_entry_lines jel JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED' JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.code IN ('100','102','108') WHERE je."companyId"=$1::text AND ($2::text IS NULL OR je."branchId"=$2::text) AND je."entryDate">=$3::timestamptz AND je."entryDate"<$4::timestamptz`, companyId, branchId, from, this.addDays(asOf, 1));
    return this.round(Number(rows[0]?.net_change ?? 0));
  }
  async workingCapital(query: CfoDashboardQuery = {}) {
    const { asOf, lookbackDays, from } = this.normalizeQuery(query);
    const [receivables, payables, inventory, sales, purchases] = await Promise.all([this.endingReceivables(asOf), this.endingPayables(asOf), this.inventoryValue(), this.periodSales(from, asOf), this.periodPurchases(from, asOf)]);
    const netWorkingCapital = this.round(receivables + inventory - payables);
    const dso = sales > 0 ? this.round((Math.max(receivables, 0) / sales) * lookbackDays) : null;
    const dpo = purchases > 0 ? this.round((Math.max(payables, 0) / purchases) * lookbackDays) : null;
    return { asOf, lookbackDays, receivables, inventory, payables, netWorkingCapital, periodSales: sales, periodPurchases: purchases, dsoDays: dso, dpoDays: dpo, cashConversionGapDays: dso !== null && dpo !== null ? this.round(dso - dpo) : null };
  }
  async cashRunway(query: CfoDashboardQuery = {}) {
    const { asOf, lookbackDays, from } = this.normalizeQuery(query);
    const [forecast, realizedNetCashFlow, settings] = await Promise.all([this.cashFlow.thirteenWeek(asOf, 'BASE'), this.realizedCashFlow(from, asOf), this.treasuryRisk.getSettings()]);
    const weeklyNetCashFlow = this.round((realizedNetCashFlow / lookbackDays) * 7);
    const weeklyBurn = weeklyNetCashFlow < 0 ? Math.abs(weeklyNetCashFlow) : 0;
    const liquidityAboveFloor = Math.max(0, this.round(forecast.openingLiquidity - Number(settings.minimumLiquidity ?? 0)));
    const runwayWeeks = weeklyBurn > 0 ? this.round(liquidityAboveFloor / weeklyBurn) : null;
    return { asOf, lookbackDays, openingLiquidity: forecast.openingLiquidity, minimumLiquidity: Number(settings.minimumLiquidity ?? 0), liquidityAboveFloor, realizedNetCashFlow, averageWeeklyNetCashFlow: weeklyNetCashFlow, averageWeeklyBurn: weeklyBurn, runwayWeeks, runwayStatus: runwayWeeks === null ? 'SELF_FUNDING' : runwayWeeks < 4 ? 'CRITICAL' : runwayWeeks < 8 ? 'WARNING' : 'HEALTHY' };
  }
  async dashboard(query: CfoDashboardQuery = {}) {
    const normalized = this.normalizeQuery(query);
    const [workingCapital, runway, forecast, alerts, stress, priorities, liquidityPosition] = await Promise.all([
      this.workingCapital(normalized),
      this.cashRunway(normalized),
      this.cashFlow.thirteenWeek(normalized.asOf, 'BASE'),
      this.treasuryRisk.liquidityAlerts(normalized.asOf),
      this.treasuryRisk.overdueReceivableStress(normalized.asOf),
      this.treasuryRisk.paymentPriorities(normalized.asOf),
      this.treasuryRisk.liquidityPosition(normalized.asOf),
    ]);
    return {
      asOf: normalized.asOf,
      lookbackDays: normalized.lookbackDays,
      liquidity: { opening: forecast.openingLiquidity, thirteenWeekClosing: forecast.forecastClosingLiquidity, thirteenWeekLowest: forecast.lowestLiquidity, projectedNetCashFlow: forecast.projectedNetCashFlow, risk: forecast.liquidityRisk },
      liquidityPosition,
      runway,
      workingCapital,
      receivablesRisk: { overdueOutstanding: stress.overdueOutstanding, overdueInstallmentCount: stress.overdueInstallmentCount, severeRecoverableCash: stress.stressScenarios.find((item) => item.scenario === 'SEVERE')?.recoverableCash ?? 0 },
      treasuryAlerts: { alertCount: alerts.alertCount, firstRiskWeek: alerts.firstRiskWeek },
      payments: { initialPaymentCapacity: priorities.initialPaymentCapacity, remainingPaymentCapacity: priorities.remainingPaymentCapacity, recommendedNowCount: priorities.recommendations.filter((item) => item.recommendedPayNow).length },
    };
  }
}
