import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { ProfitabilityService } from './profitability.service';
import { NetProfitabilityService } from './net-profitability.service';
import { ProfitabilityConfigService } from './profitability-config.service';
import { CostCenterService } from './cost-center.service';
import { BudgetingService } from './budgeting.service';
import { CashFlowForecastService } from './cash-flow-forecast.service';
import { TreasuryRiskService } from './treasury-risk.service';
import { CfoDashboardService } from './cfo-dashboard.service';
import { FinancialHealthService } from './financial-health.service';

const filterSchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
const requiredPeriodSchema = z.object({ from: z.coerce.date(), to: z.coerce.date() });
const yearSchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
const ytdSchema = z.object({ year: z.coerce.number().int().min(2000).max(2100), asOf: z.coerce.date().optional() });
const forecastSchema = z.object({ from: z.coerce.date(), to: z.coerce.date(), asOf: z.coerce.date().optional() });
const cashFlowSchema = z.object({ start: z.coerce.date().optional(), scenario: z.enum(['BASE', 'BEST', 'WORST']).default('BASE') });
const cashFlowComparisonSchema = z.object({ start: z.coerce.date().optional() });
const treasuryDateSchema = z.object({ asOf: z.coerce.date().optional() });
const treasuryAlertSchema = z.object({ start: z.coerce.date().optional() });
const treasurySettingsSchema = z.object({
  minimumLiquidity: z.coerce.number().min(0),
  warningBufferPercent: z.coerce.number().min(0).max(100).optional(),
  reportingCurrency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
});
const cfoSchema = z.object({ asOf: z.coerce.date().optional(), lookbackDays: z.coerce.number().int().min(7).max(730).optional() });
const healthThresholdSchema = z.object({ minimumHealthScore: z.coerce.number().min(0).max(100).optional(), minimumRunwayWeeks: z.coerce.number().min(0).optional(), maximumDsoDays: z.coerce.number().min(0).optional(), minimumNetWorkingCapital: z.coerce.number().optional(), maximumOverdueReceivableRatio: z.coerce.number().min(0).max(100).optional(), maximumLiquidityAlerts: z.coerce.number().int().min(0).optional() });
const commissionSchema = z.object({ rate: z.coerce.number().min(0).max(100) });
const attributionSchema = z.object({ appointmentId: z.string().uuid() });
const createCostCenterSchema = z.object({ code: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(150) });
const allocationSchema = z.object({ allocations: z.array(z.object({ branchId: z.string().uuid(), percent: z.coerce.number().positive().max(100) })).min(1) });
const assignExpenseSchema = z.object({ costCenterId: z.string().uuid() });
const budgetSchema = z.object({ targetType: z.enum(['BRANCH', 'COST_CENTER']), targetId: z.string().uuid(), metricType: z.enum(['REVENUE', 'EXPENSE']), periodStart: z.coerce.date(), periodEnd: z.coerce.date(), amount: z.coerce.number().min(0), note: z.string().trim().max(500).optional() });

@Controller('profitability')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('finance', 'read')
export class ProfitabilityController {
  constructor(
    private readonly service: ProfitabilityService,
    private readonly net: NetProfitabilityService,
    private readonly config: ProfitabilityConfigService,
    private readonly costCenters: CostCenterService,
    private readonly budgeting: BudgetingService,
    private readonly cashFlow: CashFlowForecastService,
    private readonly treasuryRisk: TreasuryRiskService,
    private readonly cfo: CfoDashboardService,
    private readonly financialHealth: FinancialHealthService,
  ) {}

  @Get('summary') summary(@Query() query: unknown) { return this.service.summary(filterSchema.parse(query)); }
  @Get('branches') byBranch(@Query() query: unknown) { return this.service.byBranch(filterSchema.parse(query)); }
  @Get('services') byService(@Query() query: unknown) { return this.service.byService(filterSchema.parse(query)); }
  @Get('staff') byStaff(@Query() query: unknown) { return this.service.byStaff(filterSchema.parse(query)); }

  @Post('staff/:staffId/commission')
  @RequirePermission('finance', 'manage')
  setStaffCommission(@Param('staffId') staffId: string, @Body() body: unknown) { return this.config.setStaffCommission(staffId, commissionSchema.parse(body).rate); }

  @Post('sale-items/:saleItemId/attribute')
  @RequirePermission('finance', 'manage')
  attributeSaleItem(@Param('saleItemId') saleItemId: string, @Body() body: unknown) { return this.config.attributeSaleItem(saleItemId, attributionSchema.parse(body).appointmentId); }

  @Post('cost-centers')
  @RequirePermission('finance', 'manage')
  createCostCenter(@Body() body: unknown) { return this.costCenters.create(createCostCenterSchema.parse(body)); }

  @Get('cost-centers') listCostCenters() { return this.costCenters.list(); }
  @Get('cost-centers/unallocated-expenses') listUnallocatedExpenses(@Query() query: unknown) { const parsed = filterSchema.parse(query); return this.costCenters.listUnallocatedExpenses(parsed.from, parsed.to); }

  @Post('cost-centers/:id/allocations')
  @RequirePermission('finance', 'manage')
  setCostCenterAllocations(@Param('id') id: string, @Body() body: unknown) { return this.costCenters.setAllocations(id, allocationSchema.parse(body)); }

  @Post('journal-lines/:journalEntryLineId/cost-center')
  @RequirePermission('finance', 'manage')
  assignExpenseLine(@Param('journalEntryLineId') journalEntryLineId: string, @Body() body: unknown) { return this.costCenters.assignExpenseLine(journalEntryLineId, assignExpenseSchema.parse(body).costCenterId); }

  @Post('budgets')
  @RequirePermission('finance', 'manage')
  upsertBudget(@Body() body: unknown) { return this.budgeting.upsert(budgetSchema.parse(body)); }

  @Get('budgets') listBudgets(@Query() query: unknown) { const parsed = filterSchema.parse(query); return this.budgeting.list(parsed.from, parsed.to); }
  @Get('budgets/actual-vs-budget') actualVsBudget(@Query() query: unknown) { const parsed = requiredPeriodSchema.parse(query); return this.budgeting.actualVsBudget(parsed.from, parsed.to); }
  @Get('budgets/monthly') monthlyBudgetPerformance(@Query() query: unknown) { return this.budgeting.monthly(yearSchema.parse(query).year); }
  @Get('budgets/ytd') ytdBudgetPerformance(@Query() query: unknown) { const parsed = ytdSchema.parse(query); return this.budgeting.ytd(parsed.year, parsed.asOf); }
  @Get('budgets/forecast') rollingForecast(@Query() query: unknown) { const parsed = forecastSchema.parse(query); return this.budgeting.forecast(parsed.from, parsed.to, parsed.asOf); }
  @Get('cash-flow/13-week') cashFlowThirteenWeek(@Query() query: unknown) { const parsed = cashFlowSchema.parse(query); return this.cashFlow.thirteenWeek(parsed.start ?? new Date(), parsed.scenario); }
  @Get('cash-flow/scenarios') cashFlowScenarios(@Query() query: unknown) { return this.cashFlow.scenarioComparison(cashFlowComparisonSchema.parse(query).start ?? new Date()); }

  @Post('treasury/settings')
  @RequirePermission('finance', 'manage')
  setTreasurySettings(@Body() body: unknown) { return this.treasuryRisk.setSettings(treasurySettingsSchema.parse(body)); }

  @Get('treasury/settings') getTreasurySettings() { return this.treasuryRisk.getSettings(); }
  @Get('treasury/liquidity-position') treasuryLiquidityPosition(@Query() query: unknown) { const parsed = treasuryDateSchema.parse(query); return this.treasuryRisk.liquidityPosition(parsed.asOf ?? new Date()); }
  @Get('treasury/alerts') treasuryAlerts(@Query() query: unknown) { const parsed = treasuryAlertSchema.parse(query); return this.treasuryRisk.liquidityAlerts(parsed.start ?? new Date()); }
  @Get('treasury/receivables/stress') overdueReceivableStress(@Query() query: unknown) { const parsed = treasuryDateSchema.parse(query); return this.treasuryRisk.overdueReceivableStress(parsed.asOf ?? new Date()); }
  @Get('treasury/payments/priorities') paymentPriorities(@Query() query: unknown) { const parsed = treasuryDateSchema.parse(query); return this.treasuryRisk.paymentPriorities(parsed.asOf ?? new Date()); }
  @Get('cfo/working-capital') cfoWorkingCapital(@Query() query: unknown) { return this.cfo.workingCapital(cfoSchema.parse(query)); }
  @Get('cfo/cash-runway') cfoCashRunway(@Query() query: unknown) { return this.cfo.cashRunway(cfoSchema.parse(query)); }
  @Get('cfo/dashboard') cfoDashboard(@Query() query: unknown) { return this.cfo.dashboard(cfoSchema.parse(query)); }
  @Get('cfo/health/thresholds') getFinancialHealthThresholds() { return this.financialHealth.getThresholds(); }

  @Post('cfo/health/thresholds')
  @RequirePermission('finance', 'manage')
  setFinancialHealthThresholds(@Body() body: unknown) { return this.financialHealth.setThresholds(healthThresholdSchema.parse(body)); }

  @Get('cfo/health') financialHealthScore(@Query() query: unknown) { return this.financialHealth.score(cfoSchema.parse(query)); }
  @Get('cfo/executive-alerts') cfoExecutiveAlerts(@Query() query: unknown) { return this.financialHealth.score(cfoSchema.parse(query)).then((result) => ({ asOf: result.asOf, healthScore: result.healthScore, healthStatus: result.healthStatus, covenantSummary: result.covenantSummary, alerts: result.executiveAlerts })); }
  @Get('net/summary') netSummary(@Query() query: unknown) { return this.net.summary(filterSchema.parse(query)); }
  @Get('net/branches') netByBranch(@Query() query: unknown) { return this.net.byBranch(filterSchema.parse(query)); }
  @Get('net/services') netByService(@Query() query: unknown) { return this.net.byService(filterSchema.parse(query)); }
  @Get('net/staff') netByStaff(@Query() query: unknown) { return this.net.byStaff(filterSchema.parse(query)); }
  @Get('net/customers') netByCustomer(@Query() query: unknown) { return this.net.byCustomer(filterSchema.parse(query)); }
}
