import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type ControlIssue = {
  code: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  domain: string;
  recordId: string | null;
  title: string;
  detail: string;
};

@Injectable()
export class FinanceControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  private context() {
    return {
      tenantId: this.tenantContext.getTenantId(),
      companyId: this.tenantContext.getCompanyId(),
      branchId: this.tenantContext.getBranchId(),
    };
  }

  private round(value: unknown) {
    return Math.round((Number(value ?? 0) + Number.EPSILON) * 100) / 100;
  }

  async settings() {
    const { tenantId, companyId } = this.context();
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId },
      select: { id: true, name: true, baseCurrency: true },
    });
    if (!company) return { companyId, baseCurrency: 'TRY' };
    return company;
  }

  async updateSettings(input: { baseCurrency: string }) {
    const { tenantId, companyId } = this.context();
    const baseCurrency = input.baseCurrency.trim().toUpperCase();
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId },
      select: { id: true, baseCurrency: true },
    });
    if (!company) throw new Error('Company not found.');
    if (company.baseCurrency === baseCurrency) return { companyId, baseCurrency };

    const posted = await this.prisma.journalEntry.count({
      where: { tenantId, companyId, status: 'POSTED' },
    });
    if (posted > 0) {
      throw new BadRequestException(
        'Baz para birimi, muhasebeleştirilmiş kayıt oluştuktan sonra değiştirilemez.',
      );
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { baseCurrency },
      select: { id: true, name: true, baseCurrency: true },
    });
    return updated;
  }

  async projection() {
    const { tenantId, companyId, branchId } = this.context();
    const [ledgerRows, financeRows, bankRows, posRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT coa.code,coa.name,coa.type::text AS type,
                COALESCE(SUM(jel.debit-jel.credit),0)::numeric AS balance
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id=jel."journalEntryId" AND je.status='POSTED'
         JOIN chart_of_accounts coa ON coa.id=jel."accountId"
         WHERE je."tenantId"=$1::text AND je."companyId"=$2::text
           AND ($3::text IS NULL OR je."branchId"=$3::text)
           AND (coa.code IN ('100','102','108','120','320') OR coa.type='REVENUE')
         GROUP BY coa.code,coa.name,coa.type
         ORDER BY coa.code`,
        tenantId,
        companyId,
        branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT
           COALESCE((SELECT SUM(gross_amount*exchange_rate) FROM income_records
             WHERE tenant_id=$1::text AND company_id=$2::text
               AND ($3::text IS NULL OR branch_id=$3::text)
               AND approval_status='APPROVED'),0)::numeric AS "recognizedIncome",
           COALESCE((SELECT SUM(gross_amount*exchange_rate) FROM expenses
             WHERE tenant_id=$1::text AND company_id=$2::text
               AND ($3::text IS NULL OR branch_id=$3::text)
               AND approval_status='APPROVED'),0)::numeric AS "recognizedExpense",
           COALESCE((SELECT SUM(c.amount*c.exchange_rate)
             FROM income_collections c
             JOIN income_records i ON i.id=c.income_record_id
             LEFT JOIN income_collection_reversals r ON r.income_collection_id=c.id
             WHERE c.tenant_id=$1::text AND c.company_id=$2::text
               AND ($3::text IS NULL OR c.branch_id=$3::text) AND r.id IS NULL),0)::numeric AS collected,
           COALESCE((SELECT SUM(p.amount*p.exchange_rate)
             FROM expense_payments p
             JOIN expenses e ON e.id=p.expense_id
             LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=p.id
             WHERE p.tenant_id=$1::text AND p.company_id=$2::text
               AND ($3::text IS NULL OR p.branch_id=$3::text) AND r.id IS NULL),0)::numeric AS paid`,
        tenantId,
        companyId,
        branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT currency,
                COALESCE(SUM(current_balance),0)::numeric AS "currentBalance",
                COALESCE(SUM(available_balance),0)::numeric AS "availableBalance",
                MAX(balance_as_of) AS "balanceAsOf"
         FROM bank_accounts
         WHERE tenant_id=$1::text AND company_id=$2::text
           AND ($3::text IS NULL OR branch_id=$3::text) AND active=TRUE
         GROUP BY currency ORDER BY currency`,
        tenantId,
        companyId,
        branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT currency,
                COALESCE(SUM(net_amount),0)::numeric AS "unsettledNet",
                COUNT(*)::int AS "transactionCount"
         FROM pos_transactions
         WHERE tenant_id=$1::text AND company_id=$2::text
           AND ($3::text IS NULL OR branch_id=$3::text)
           AND status='CAPTURED' AND settled_at IS NULL
         GROUP BY currency ORDER BY currency`,
        tenantId,
        companyId,
        branchId,
      ),
    ]);

    const ledger = Object.fromEntries(
      ledgerRows.map((row) => [String(row.code), this.round(row.balance)]),
    );
    const revenue = this.round(
      ledgerRows
        .filter((row) => String(row.type) === 'REVENUE' && String(row.code) !== '646')
        .reduce((sum, row) => sum + Math.abs(Number(row.balance ?? 0)), 0),
    );
    const finance = financeRows[0] ?? {};
    return {
      currencyBasis: 'BASE_CURRENCY_BY_TRANSACTION_EXCHANGE_RATE',
      ledger: {
        cash: ledger['100'] ?? 0,
        bank: ledger['102'] ?? 0,
        posReceivable: ledger['108'] ?? 0,
        customerReceivable: ledger['120'] ?? 0,
        supplierPayable: Math.abs(ledger['320'] ?? 0),
        revenue,
      },
      subledger: {
        recognizedIncome: this.round(finance.recognizedIncome),
        recognizedExpense: this.round(finance.recognizedExpense),
        collected: this.round(finance.collected),
        paid: this.round(finance.paid),
      },
      provider: {
        bankBalances: bankRows.map((row) => ({
          currency: String(row.currency),
          currentBalance: this.round(row.currentBalance),
          availableBalance: this.round(row.availableBalance),
          balanceAsOf: row.balanceAsOf ?? null,
        })),
        unsettledPos: posRows.map((row) => ({
          currency: String(row.currency),
          unsettledNet: this.round(row.unsettledNet),
          transactionCount: Number(row.transactionCount ?? 0),
        })),
      },
    };
  }

  async integrity() {
    const { tenantId, companyId, branchId } = this.context();
    const [manualIncome, expenses, collections, payments] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT i.id,i.document_number AS "documentNumber"
         FROM income_records i
         WHERE i.tenant_id=$1::text AND i.company_id=$2::text
           AND ($3::text IS NULL OR i.branch_id=$3::text)
           AND i.source_type IS NULL AND i.accounting_status='POSTED'
           AND NOT EXISTS (
             SELECT 1 FROM journal_entries je
             WHERE je."companyId"=i.company_id AND je."referenceType"='INCOME'
               AND je."referenceId"=i.id
           )
         LIMIT 200`,
        tenantId, companyId, branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT e.id,e.document_number AS "documentNumber"
         FROM expenses e
         WHERE e.tenant_id=$1::text AND e.company_id=$2::text
           AND ($3::text IS NULL OR e.branch_id=$3::text)
           AND e.accounting_status='POSTED'
           AND NOT EXISTS (
             SELECT 1 FROM journal_entries je
             WHERE je."companyId"=e.company_id AND je."referenceType"='EXPENSE'
               AND je."referenceId"=e.id
           )
         LIMIT 200`,
        tenantId, companyId, branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT c.id,c.income_record_id AS "incomeRecordId"
         FROM income_collections c
         LEFT JOIN income_collection_reversals r ON r.income_collection_id=c.id
         WHERE c.tenant_id=$1::text AND c.company_id=$2::text
           AND ($3::text IS NULL OR c.branch_id=$3::text) AND r.id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM journal_entries je
             WHERE je."companyId"=c.company_id AND je."referenceType"='INCOME_COLLECTION'
               AND je."referenceId"=c.id
           )
         LIMIT 200`,
        tenantId, companyId, branchId,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT p.id,p.expense_id AS "expenseId"
         FROM expense_payments p
         LEFT JOIN expense_payment_reversals r ON r.expense_payment_id=p.id
         WHERE p.tenant_id=$1::text AND p.company_id=$2::text
           AND ($3::text IS NULL OR p.branch_id=$3::text) AND r.id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM journal_entries je
             WHERE je.id=p.journal_entry_id AND je.status='POSTED'
           )
         LIMIT 200`,
        tenantId, companyId, branchId,
      ),
    ]);

    const issues: ControlIssue[] = [];
    for (const row of manualIncome) issues.push({
      code: 'INCOME_WITHOUT_JOURNAL',
      severity: 'CRITICAL',
      domain: 'Gelir',
      recordId: row.id,
      title: 'Muhasebe fişi bulunmayan gelir',
      detail: row.documentNumber ? `Belge: ${row.documentNumber}` : 'Gelir kaydı muhasebeleştirilmiş görünüyor ancak fiş bulunamadı.',
    });
    for (const row of expenses) issues.push({
      code: 'EXPENSE_WITHOUT_JOURNAL',
      severity: 'CRITICAL',
      domain: 'Gider',
      recordId: row.id,
      title: 'Muhasebe fişi bulunmayan gider',
      detail: row.documentNumber ? `Belge: ${row.documentNumber}` : 'Gider kaydı muhasebeleştirilmiş görünüyor ancak fiş bulunamadı.',
    });
    for (const row of collections) issues.push({
      code: 'COLLECTION_WITHOUT_JOURNAL',
      severity: 'CRITICAL',
      domain: 'Tahsilat',
      recordId: row.id,
      title: 'Muhasebe fişi bulunmayan tahsilat',
      detail: 'Tahsilat alt defterde mevcut ancak genel muhasebe fişi bulunamadı.',
    });
    for (const row of payments) issues.push({
      code: 'PAYMENT_WITHOUT_POSTED_JOURNAL',
      severity: 'CRITICAL',
      domain: 'Ödeme',
      recordId: row.id,
      title: 'Muhasebe fişi bulunmayan ödeme',
      detail: 'Gider ödemesi mevcut ancak bağlı muhasebe fişi post edilmiş durumda değil.',
    });

    return {
      healthy: issues.length === 0,
      issueCount: issues.length,
      criticalCount: issues.filter((issue) => issue.severity === 'CRITICAL').length,
      checkedAt: new Date(),
      issues,
    };
  }

  async kpiValidation() {
    const projection = await this.projection();
    const tolerance = 0.01;
    const revenueVariance = this.round(
      projection.subledger.recognizedIncome - projection.ledger.revenue,
    );
    const tryBank = projection.provider.bankBalances.find((item) => item.currency === 'TRY') ?? null;
    const tryPos = projection.provider.unsettledPos.find((item) => item.currency === 'TRY') ?? null;
    const bankVariance = tryBank
      ? this.round(tryBank.currentBalance - projection.ledger.bank)
      : null;
    const posVariance = tryPos
      ? this.round(tryPos.unsettledNet - projection.ledger.posReceivable)
      : null;

    const checks = [
      {
        code: 'RECOGNIZED_INCOME_VS_GL_REVENUE',
        label: 'Gelir kayıtları / muhasebe gelir hesabı',
        expected: projection.subledger.recognizedIncome,
        actual: projection.ledger.revenue,
        variance: revenueVariance,
        ok: Math.abs(revenueVariance) <= tolerance,
      },
      {
        code: 'BANK_PROVIDER_VS_GL_102',
        label: 'Canlı banka bakiyesi / 102 Bankalar',
        expected: tryBank?.currentBalance ?? null,
        actual: projection.ledger.bank,
        variance: bankVariance,
        comparable: Boolean(tryBank),
        ok: bankVariance == null ? true : Math.abs(bankVariance) <= tolerance,
      },
      {
        code: 'UNSETTLED_POS_VS_GL_108',
        label: 'Bekleyen POS / 108 POS Alacakları',
        expected: tryPos?.unsettledNet ?? null,
        actual: projection.ledger.posReceivable,
        variance: posVariance,
        comparable: Boolean(tryPos),
        ok: posVariance == null ? true : Math.abs(posVariance) <= tolerance,
      },
    ];
    return {
      tolerance,
      valid: checks.every((check) => check.ok),
      checks,
      projection,
    };
  }

  async auditTrail(limitInput = 200) {
    const { tenantId, companyId, branchId } = this.context();
    const limit = Math.min(Math.max(limitInput, 1), 500);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM (
         SELECT e.id,e.created_at AS "createdAt",'EXPENSE'::text AS domain,e.event_type AS "eventType",
                e.expense_id AS "recordId",e.actor_id AS "actorId",e.reason,
                e.before_state AS "beforeState",e.after_state AS "afterState"
         FROM expense_audit_events e
         WHERE e.tenant_id=$1::text AND e.company_id=$2::text
           AND ($3::text IS NULL OR e.branch_id=$3::text)
         UNION ALL
         SELECT i.id,i.created_at AS "createdAt",'INCOME'::text AS domain,i.event_type AS "eventType",
                i.income_record_id AS "recordId",i.actor_id AS "actorId",i.reason,
                i.before_state AS "beforeState",i.after_state AS "afterState"
         FROM income_audit_events i
         WHERE i.tenant_id=$1::text AND i.company_id=$2::text
           AND ($3::text IS NULL OR i.branch_id=$3::text)
         UNION ALL
         SELECT f.id,f.created_at AS "createdAt",'CONFIGURATION'::text AS domain,f.operation::text AS "eventType",
                f.entity_id AS "recordId",f.actor_id AS "actorId",NULL::text AS reason,
                f.before_state AS "beforeState",f.after_state AS "afterState"
         FROM finance_configuration_audit_events f
         WHERE f.tenant_id=$1::text AND (f.company_id=$2::text OR f.company_id IS NULL)
         UNION ALL
         SELECT je.id||':created',je."createdAt",'ACCOUNTING','JOURNAL_CREATED',je.id,je."createdBy",NULL::text,
                NULL::jsonb,jsonb_build_object('status','DRAFT')
         FROM journal_entries je
         WHERE je."tenantId"=$1::text AND je."companyId"=$2::text
           AND ($3::text IS NULL OR je."branchId"=$3::text) AND je."createdBy" IS NOT NULL
         UNION ALL
         SELECT je.id||':submitted',je."submittedAt",'ACCOUNTING','JOURNAL_SUBMITTED',je.id,je."submittedBy",NULL::text,
                jsonb_build_object('status','DRAFT'),jsonb_build_object('status','SUBMITTED')
         FROM journal_entries je
         WHERE je."tenantId"=$1::text AND je."companyId"=$2::text
           AND ($3::text IS NULL OR je."branchId"=$3::text) AND je."submittedAt" IS NOT NULL
         UNION ALL
         SELECT je.id||':approved',je."approvedAt",'ACCOUNTING','JOURNAL_APPROVED',je.id,je."approvedBy",NULL::text,
                jsonb_build_object('status','SUBMITTED'),jsonb_build_object('status','APPROVED')
         FROM journal_entries je
         WHERE je."tenantId"=$1::text AND je."companyId"=$2::text
           AND ($3::text IS NULL OR je."branchId"=$3::text) AND je."approvedAt" IS NOT NULL
         UNION ALL
         SELECT je.id||':posted',je."postedAt",'ACCOUNTING','JOURNAL_POSTED',je.id,je."postedBy",NULL::text,
                jsonb_build_object('status','APPROVED'),jsonb_build_object('status','POSTED')
         FROM journal_entries je
         WHERE je."tenantId"=$1::text AND je."companyId"=$2::text
           AND ($3::text IS NULL OR je."branchId"=$3::text) AND je."postedAt" IS NOT NULL
         UNION ALL
         SELECT fp.id||':closed',fp.closed_at,'PERIOD','PERIOD_CLOSED',fp.id,fp.closed_by,fp.close_reason,
                jsonb_build_object('status','OPEN'),jsonb_build_object('status','CLOSED','name',fp.name)
         FROM financial_periods fp
         WHERE fp.tenant_id=$1::text AND fp.company_id=$2::text
           AND ($3::text IS NULL OR fp.branch_id IS NULL OR fp.branch_id=$3::text)
           AND fp.closed_at IS NOT NULL
         UNION ALL
         SELECT fp.id||':reopened',fp.reopened_at,'PERIOD','PERIOD_REOPENED',fp.id,fp.reopened_by,NULL::text,
                jsonb_build_object('status','CLOSED'),jsonb_build_object('status','OPEN','name',fp.name)
         FROM financial_periods fp
         WHERE fp.tenant_id=$1::text AND fp.company_id=$2::text
           AND ($3::text IS NULL OR fp.branch_id IS NULL OR fp.branch_id=$3::text)
           AND fp.reopened_at IS NOT NULL
       ) events
       ORDER BY "createdAt" DESC,id DESC
       LIMIT $4`,
      tenantId, companyId, branchId, limit,
    );
  }
}
