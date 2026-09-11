import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { CashFlowForecastService } from './cash-flow-forecast.service';

export interface TreasuryRiskSettingsInput {
  minimumLiquidity: number;
  warningBufferPercent?: number;
  reportingCurrency?: string;
}

@Injectable()
export class TreasuryRiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly cashFlow: CashFlowForecastService,
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

  private startOfDay(value: Date) {
    const result = new Date(value);
    result.setUTCHours(0, 0, 0, 0);
    return result;
  }

  private diffDays(later: Date, earlier: Date) {
    return Math.floor(
      (this.startOfDay(later).getTime() - this.startOfDay(earlier).getTime()) /
        (24 * 60 * 60 * 1000),
    );
  }

  async liquidityPosition(asOfInput: Date = new Date()) {
    const { tenantId, companyId, branchId } = this.context();
    const asOf = new Date(asOfInput);
    const [bookRows, bankRows, settlementRows, unknownSettlementRows, settings] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT coa.code,COALESCE(SUM(jel.debit-jel.credit),0)::numeric AS amount
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED'
         JOIN chart_of_accounts coa ON coa.id=jel."accountId" AND coa.code IN ('100','102','108')
         WHERE je."companyId"=$1::text
           AND ($2::text IS NULL OR je."branchId"=$2::text)
           AND je."entryDate"<=$3::timestamptz
         GROUP BY coa.code`,
        companyId,
        branchId,
        asOf,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT currency,
                COALESCE(SUM(current_balance),0)::numeric AS "currentBalance",
                COALESCE(SUM(available_balance),0)::numeric AS "availableBalance",
                MAX(balance_as_of) AS "balanceAsOf",
                COUNT(*)::int AS "accountCount"
         FROM bank_accounts
         WHERE tenant_id=$1::text AND company_id=$2::text
           AND ($3::text IS NULL OR branch_id=$3::text)
           AND active=TRUE
         GROUP BY currency
         ORDER BY currency`,
        tenantId,
        companyId,
        branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT currency,
                DATE(expected_settlement_at) AS "settlementDate",
                COALESCE(SUM(amount),0)::numeric AS "grossAmount",
                COALESCE(SUM(fee_amount),0)::numeric AS "feeAmount",
                COALESCE(SUM(net_amount),0)::numeric AS "netAmount",
                COUNT(*)::int AS "transactionCount"
         FROM pos_transactions
         WHERE tenant_id=$1::text AND company_id=$2::text
           AND ($3::text IS NULL OR branch_id=$3::text)
           AND status='CAPTURED' AND settled_at IS NULL
           AND expected_settlement_at IS NOT NULL
         GROUP BY currency,DATE(expected_settlement_at)
         ORDER BY DATE(expected_settlement_at),currency`,
        tenantId,
        companyId,
        branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT currency,
                COALESCE(SUM(net_amount),0)::numeric AS "netAmount",
                COUNT(*)::int AS "transactionCount"
         FROM pos_transactions
         WHERE tenant_id=$1::text AND company_id=$2::text
           AND ($3::text IS NULL OR branch_id=$3::text)
           AND status='CAPTURED' AND settled_at IS NULL
           AND expected_settlement_at IS NULL
         GROUP BY currency
         ORDER BY currency`,
        tenantId,
        companyId,
        branchId,
      ),
      this.getSettings(),
    ]);

    const book = new Map<string, number>();
    for (const row of bookRows) book.set(String(row.code), this.round(Number(row.amount ?? 0)));
    const cashOnHand = book.get('100') ?? 0;
    const bookBankBalance = book.get('102') ?? 0;
    const posReceivables = book.get('108') ?? 0;
    const bookActualCash = this.round(cashOnHand + bookBankBalance);
    const bookTotalLiquidPosition = this.round(bookActualCash + posReceivables);

    const providerBankBalances = bankRows.map((row) => ({
      currency: String(row.currency),
      currentBalance: this.round(Number(row.currentBalance ?? 0)),
      availableBalance: this.round(Number(row.availableBalance ?? 0)),
      balanceAsOf: row.balanceAsOf ?? null,
      accountCount: Number(row.accountCount ?? 0),
    }));

    const reportingCurrency = settings.reportingCurrency ?? null;
    const comparableProviderBalance = reportingCurrency
      ? providerBankBalances.find((row) => row.currency === reportingCurrency) ?? null
      : null;
    const bankVariance = reportingCurrency && comparableProviderBalance
      ? {
          currency: reportingCurrency,
          bookBalance: bookBankBalance,
          providerCurrentBalance: comparableProviderBalance.currentBalance,
          variance: this.round(comparableProviderBalance.currentBalance - bookBankBalance),
          providerBalanceAsOf: comparableProviderBalance.balanceAsOf,
          comparable: true,
          reason: null,
        }
      : {
          currency: reportingCurrency,
          bookBalance: bookBankBalance,
          providerCurrentBalance: null,
          variance: null,
          providerBalanceAsOf: null,
          comparable: false,
          reason: reportingCurrency ? 'NO_PROVIDER_BALANCE_FOR_REPORTING_CURRENCY' : 'REPORTING_CURRENCY_NOT_CONFIGURED',
        };

    const settlementForecast = settlementRows.map((row) => ({
      settlementDate: row.settlementDate,
      currency: String(row.currency),
      grossAmount: this.round(Number(row.grossAmount ?? 0)),
      feeAmount: this.round(Number(row.feeAmount ?? 0)),
      expectedNetCash: this.round(Number(row.netAmount ?? 0)),
      transactionCount: Number(row.transactionCount ?? 0),
      overdue: new Date(row.settlementDate).getTime() < this.startOfDay(asOf).getTime(),
    }));
    const unknownSettlementTiming = unknownSettlementRows.map((row) => ({
      currency: String(row.currency),
      expectedNetCash: this.round(Number(row.netAmount ?? 0)),
      transactionCount: Number(row.transactionCount ?? 0),
    }));

    return {
      asOf,
      reportingCurrency,
      book: {
        cashOnHand,
        bankBalance: bookBankBalance,
        actualCash: bookActualCash,
        posReceivables,
        nearCash: posReceivables,
        totalLiquidPosition: bookTotalLiquidPosition,
      },
      provider: {
        bankBalancesByCurrency: providerBankBalances,
      },
      reconciliation: {
        bankVariance,
      },
      posSettlementForecast: {
        scheduled: settlementForecast,
        unknownTiming: unknownSettlementTiming,
      },
      definitions: {
        actualCash: '100 Cash + 102 Banks',
        nearCash: '108 POS Receivables',
        totalLiquidPosition: 'Actual Cash + Near Cash',
        bankVariance: 'Provider current balance - 102 book balance, only in configured reporting currency',
      },
    };
  }

  async setSettings(input: TreasuryRiskSettingsInput) {
    const { tenantId, companyId, branchId } = this.context();
    const minimumLiquidity = this.round(Number(input.minimumLiquidity));
    const warningBufferPercent = this.round(Number(input.warningBufferPercent ?? 20));
    const reportingCurrency = input.reportingCurrency?.trim().toUpperCase() || null;

    if (!Number.isFinite(minimumLiquidity) || minimumLiquidity < 0) {
      throw new BadRequestException('Minimum liquidity must be zero or greater.');
    }
    if (!Number.isFinite(warningBufferPercent) || warningBufferPercent < 0 || warningBufferPercent > 100) {
      throw new BadRequestException('Warning buffer percent must be between 0 and 100.');
    }
    if (reportingCurrency && !/^[A-Z]{3}$/.test(reportingCurrency)) {
      throw new BadRequestException('Reporting currency must be a 3-letter ISO currency code.');
    }

    const id = randomUUID();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO treasury_risk_settings(
         id,tenant_id,company_id,branch_id,minimum_liquidity,warning_buffer_percent,reporting_currency,created_at,updated_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,NOW(),NOW())
       ON CONFLICT(company_id,(COALESCE(branch_id,'')))
       DO UPDATE SET minimum_liquidity=EXCLUDED.minimum_liquidity,
                     warning_buffer_percent=EXCLUDED.warning_buffer_percent,
                     reporting_currency=EXCLUDED.reporting_currency,
                     updated_at=NOW()
       RETURNING id,company_id AS "companyId",branch_id AS "branchId",
                 minimum_liquidity AS "minimumLiquidity",
                 warning_buffer_percent AS "warningBufferPercent",
                 reporting_currency AS "reportingCurrency",updated_at AS "updatedAt"`,
      id, tenantId, companyId, branchId, minimumLiquidity, warningBufferPercent, reportingCurrency,
    );
    return rows[0];
  }

  async getSettings() {
    const { companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,company_id AS "companyId",branch_id AS "branchId",
              minimum_liquidity AS "minimumLiquidity",
              warning_buffer_percent AS "warningBufferPercent",
              reporting_currency AS "reportingCurrency",updated_at AS "updatedAt"
       FROM treasury_risk_settings
       WHERE company_id=$1::text
         AND COALESCE(branch_id,'')=COALESCE($2::text,'')
       LIMIT 1`, companyId, branchId);
    if (!rows.length) return { companyId, branchId, minimumLiquidity: 0, warningBufferPercent: 20, reportingCurrency: null, configured: false };
    return { ...rows[0], minimumLiquidity: this.round(Number(rows[0].minimumLiquidity ?? 0)), warningBufferPercent: this.round(Number(rows[0].warningBufferPercent ?? 20)), reportingCurrency: rows[0].reportingCurrency ?? null, configured: true };
  }

  async liquidityAlerts(startInput: Date) {
    const [settings, forecast] = await Promise.all([this.getSettings(), this.cashFlow.thirteenWeek(startInput, 'BASE')]);
    const minimumLiquidity = Number(settings.minimumLiquidity ?? 0);
    const warningThreshold = this.round(minimumLiquidity * (1 + Number(settings.warningBufferPercent ?? 20) / 100));
    const alerts = forecast.weeks.filter((week) => week.closingLiquidity < warningThreshold).map((week) => {
      const critical = week.closingLiquidity < minimumLiquidity;
      return { week: week.week, start: week.start, end: week.end, closingLiquidity: week.closingLiquidity, minimumLiquidity, warningThreshold, shortfall: critical ? this.round(minimumLiquidity - week.closingLiquidity) : 0, severity: critical ? 'CRITICAL' : 'WARNING' };
    });
    return { start: forecast.start, horizonWeeks: 13, openingLiquidity: forecast.openingLiquidity, minimumLiquidity, warningThreshold, alertCount: alerts.length, firstRiskWeek: alerts[0]?.week ?? null, alerts };
  }

  async overdueReceivableStress(asOfInput: Date) {
    const { companyId, branchId } = this.context();
    const asOf = this.startOfDay(asOfInput);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT i.id,i."dueAt" AS "dueAt",s."customerId" AS "customerId",
              GREATEST(i.amount-COALESCE(SUM(CASE WHEN sp.status='COMPLETED' THEN ia.amount ELSE 0 END),0),0)::numeric AS outstanding
       FROM installments i
       JOIN installment_plans ip ON ip.id=i."installmentPlanId"
       JOIN sales s ON s.id=ip."saleId" AND s.status='CONFIRMED'
       JOIN branches b ON b.id=s."branchId"
       LEFT JOIN installment_allocations ia ON ia."installmentId"=i.id
       LEFT JOIN sale_payments sp ON sp.id=ia."salePaymentId"
       WHERE b."companyId"=$1::text AND ($2::text IS NULL OR s."branchId"=$2::text) AND i."dueAt"<$3::timestamptz
       GROUP BY i.id,i."dueAt",i.amount,s."customerId"
       HAVING GREATEST(i.amount-COALESCE(SUM(CASE WHEN sp.status='COMPLETED' THEN ia.amount ELSE 0 END),0),0)>0
       ORDER BY i."dueAt"`, companyId, branchId, asOf);
    const buckets = { days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
    let total = 0;
    const customers = new Map<string, number>();
    for (const row of rows) {
      const amount = Number(row.outstanding ?? 0);
      const overdueDays = Math.max(1, this.diffDays(asOf, new Date(row.dueAt)));
      total += amount;
      customers.set(row.customerId, (customers.get(row.customerId) ?? 0) + amount);
      if (overdueDays <= 30) buckets.days1to30 += amount;
      else if (overdueDays <= 60) buckets.days31to60 += amount;
      else if (overdueDays <= 90) buckets.days61to90 += amount;
      else buckets.days90plus += amount;
    }
    const overdueOutstanding = this.round(total);
    const normalizedBuckets = Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, this.round(value)]));
    const topCustomers = Array.from(customers.entries()).map(([customerId, amount]) => ({ customerId, outstanding: this.round(amount) })).sort((a, b) => b.outstanding - a.outstanding).slice(0, 10);
    return { asOf, overdueInstallmentCount: rows.length, overdueOutstanding, buckets: normalizedBuckets, stressScenarios: [{ scenario: 'NORMAL', recoveryRate: 0.8 }, { scenario: 'STRESS', recoveryRate: 0.5 }, { scenario: 'SEVERE', recoveryRate: 0.25 }].map((item) => ({ ...item, recoverableCash: this.round(overdueOutstanding * item.recoveryRate), potentialLossOrDelay: this.round(overdueOutstanding * (1 - item.recoveryRate)) })), topCustomers };
  }

  async paymentPriorities(asOfInput: Date) {
    const { companyId, branchId } = this.context();
    const asOf = this.startOfDay(asOfInput);
    const [settings, forecast, rows] = await Promise.all([
      this.getSettings(), this.cashFlow.thirteenWeek(asOf, 'BASE'),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT sb.id,sb.supplier_id AS "supplierId",s.name AS "supplierName",
                sb.invoice_number AS "invoiceNumber",sb.description,sb.due_at AS "dueAt",
                GREATEST(sb.amount-COALESCE(SUM(sbp.amount),0),0)::numeric AS outstanding
         FROM supplier_bills sb JOIN inventory_suppliers s ON s.id=sb.supplier_id
         LEFT JOIN supplier_bill_payments sbp ON sbp.supplier_bill_id=sb.id
         WHERE sb.company_id=$1::text AND ($2::text IS NULL OR sb.branch_id=$2::text) AND sb.status<>'CANCELLED'
         GROUP BY sb.id,sb.supplier_id,s.name,sb.invoice_number,sb.description,sb.due_at,sb.amount
         HAVING GREATEST(sb.amount-COALESCE(SUM(sbp.amount),0),0)>0
         ORDER BY sb.due_at NULLS LAST,sb.created_at`, companyId, branchId),
    ]);
    const minimumLiquidity = Number(settings.minimumLiquidity ?? 0);
    let availableForPayments = Math.max(0, this.round(forecast.openingLiquidity - minimumLiquidity));
    const ranked = rows.map((row) => {
      const dueAt = row.dueAt ? new Date(row.dueAt) : null;
      const overdueDays = dueAt ? Math.max(0, this.diffDays(asOf, dueAt)) : 0;
      const dueInDays = dueAt ? this.diffDays(dueAt, asOf) : null;
      const outstanding = this.round(Number(row.outstanding ?? 0));
      let priorityScore = 0;
      if (overdueDays > 0) priorityScore += 100 + Math.min(overdueDays, 90);
      else if (dueInDays !== null && dueInDays <= 7) priorityScore += 80;
      else if (dueInDays !== null && dueInDays <= 30) priorityScore += 50;
      else if (dueAt) priorityScore += 20;
      priorityScore += Math.min(Math.floor(outstanding / 10000), 20);
      return { billId: row.id, supplierId: row.supplierId, supplierName: row.supplierName, invoiceNumber: row.invoiceNumber, description: row.description, dueAt, overdueDays, dueInDays, outstanding, priorityScore, urgency: overdueDays > 0 ? 'OVERDUE' : dueInDays !== null && dueInDays <= 7 ? 'DUE_SOON' : 'PLANNED' };
    }).sort((a, b) => b.priorityScore - a.priorityScore);
    const recommendations = ranked.map((item) => {
      const recommendedPayNow = availableForPayments >= item.outstanding;
      if (recommendedPayNow) availableForPayments = this.round(availableForPayments - item.outstanding);
      return { ...item, recommendedPayNow, recommendation: recommendedPayNow ? 'PAY_NOW' : item.urgency === 'OVERDUE' ? 'NEGOTIATE_OR_PARTIAL_PAY' : 'SCHEDULE' };
    });
    return { asOf, openingLiquidity: forecast.openingLiquidity, minimumLiquidity, initialPaymentCapacity: this.round(Math.max(0, forecast.openingLiquidity - minimumLiquidity)), remainingPaymentCapacity: availableForPayments, recommendations };
  }
}
