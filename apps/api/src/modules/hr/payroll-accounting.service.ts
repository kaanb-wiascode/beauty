import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';
import { ApprovalRuntimeService } from '../approval-workflows/approval-runtime.service';

export type PayrollItemInput = {
  staffId: string;
  branchId: string;
  costCenterId?: string;
  grossAmount: number;
  netAmount: number;
  incomeTax?: number;
  stampTax?: number;
  employeeSocialSecurity?: number;
  unemploymentEmployee?: number;
  employerSocialSecurity?: number;
  unemploymentEmployer?: number;
  otherDeductions?: number;
  employerCost: number;
  note?: string;
};

@Injectable()
export class PayrollAccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
    private readonly approvalRuntime: ApprovalRuntimeService,
  ) {}

  private context() {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
    };
  }

  private async branchIds(): Promise<string[] | null> {
    const branchId = this.tenant.getBranchId();
    if (branchId) return [branchId];
    const roleScope = this.tenant.getRoleScope();
    if (roleScope === 'CENTRAL') return null;
    if (roleScope === 'COMPANY') return this.organizationScope.getAssignedActiveBranchIds();
    return [];
  }

  private round(v: number) {
    return Math.round((v + Number.EPSILON) * 100) / 100;
  }

  private journalNumber(d: Date) {
    return `JE-${d.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private role(v: string | null | undefined) {
    return (v ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  private async assertApprover(userId: string) {
    const { tenantId, companyId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.slug AS "roleSlug",r.name AS "roleName"
       FROM memberships m JOIN roles r ON r.id=m."roleId"
       WHERE m."userId"=$1::text AND m."tenantId"=$2::text AND m.status='ACTIVE'
         AND (m."companyId" IS NULL OR m."companyId"=$3::text)
       LIMIT 1`,
      userId,
      tenantId,
      companyId,
    );
    const actor = rows[0];
    if (!actor) throw new ForbiddenException('Approver has no active membership.');
    const ids = new Set([this.role(actor.roleSlug), this.role(actor.roleName)]);
    const allowed = [
      'hr-manager',
      'human-resources-manager',
      'finance',
      'finance-manager',
      'finance-director',
      'cfo',
      'company-manager',
      'general-manager',
      'director',
      'owner',
      'admin',
      'super-admin',
    ];
    if (!allowed.some((r) => ids.has(r))) {
      throw new ForbiddenException('Payroll approval requires HR, finance or management authority.');
    }
  }

  private async ensurePayrollApprovalWorkflow(tx:Prisma.TransactionClient,userId:string){
    const {tenantId,companyId}=this.context();
    const workflowKey='hr.payroll-period-approval';
    const lockKey=`${tenantId}:${companyId}:${workflowKey}:default-workflow`;
    await tx.$queryRaw`WITH lock_guard AS (SELECT pg_advisory_xact_lock(hashtext(${lockKey}))) SELECT 1 AS locked FROM lock_guard`;
    const existing=await tx.$queryRaw<Array<{id:string}>>`
      SELECT id FROM approval_workflow_definitions
      WHERE "tenantId"=${tenantId} AND "companyId"=${companyId}
        AND "workflowKey"=${workflowKey} AND status='PUBLISHED'
      LIMIT 1
    `;
    if(existing.length)return;
    const versions=await tx.$queryRaw<Array<{version:number}>>`
      SELECT COALESCE(MAX(version),0)::int AS version
      FROM approval_workflow_definitions
      WHERE "tenantId"=${tenantId} AND "companyId"=${companyId}
        AND "workflowKey"=${workflowKey}
    `;
    const version=Number(versions[0]?.version??0)+1;
    const steps=[
      {
        key:'accounting-control',
        name:'Muhasebe Kontrolü',
        approverType:'ROLE',
        approverValue:'accounting-manager',
        slaMinutes:240,
        timeoutAction:'ESCALATE',
        escalationApproverType:'ROLE',
        escalationApproverValue:'finance-manager',
      },
      {
        key:'upper-management-approval',
        name:'Üst Yönetim Onayı',
        approverType:'ROLE',
        approverValue:'general-manager',
        slaMinutes:240,
        timeoutAction:'ESCALATE',
        escalationApproverType:'ROLE',
        escalationApproverValue:'owner',
      },
    ];
    await tx.$executeRaw`
      INSERT INTO approval_workflow_definitions(
        id,"tenantId","companyId","workflowKey",name,domain,description,
        version,status,conditions,steps,"createdByUserId","publishedAt","createdAt","updatedAt"
      ) VALUES(
        gen_random_uuid()::text,${tenantId},${companyId},${workflowKey},
        'Bordro Onay Akışı','hr',
        'Bordro dönemleri için muhasebe kontrolü ve üst yönetim onayı.',
        ${version},'PUBLISHED','{}'::jsonb,${JSON.stringify(steps)}::jsonb,
        ${userId},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      )
    `;
  }

  private validate(input: PayrollItemInput) {
    const nums = [
      'grossAmount',
      'netAmount',
      'incomeTax',
      'stampTax',
      'employeeSocialSecurity',
      'unemploymentEmployee',
      'employerSocialSecurity',
      'unemploymentEmployer',
      'otherDeductions',
      'employerCost',
    ] as const;
    for (const k of nums) {
      const v = Number(input[k] ?? 0);
      if (!Number.isFinite(v) || v < 0) throw new BadRequestException(`${k} cannot be negative.`);
    }
    const employeeDeductions = this.round(
      Number(input.incomeTax ?? 0) +
        Number(input.stampTax ?? 0) +
        Number(input.employeeSocialSecurity ?? 0) +
        Number(input.unemploymentEmployee ?? 0) +
        Number(input.otherDeductions ?? 0),
    );
    const expectedNet = this.round(Number(input.grossAmount) - employeeDeductions);
    if (Math.abs(expectedNet - this.round(Number(input.netAmount))) > 0.01) {
      throw new BadRequestException(`Net payroll does not reconcile. Expected ${expectedNet}.`);
    }
    const expectedEmployerCost = this.round(
      Number(input.grossAmount) +
        Number(input.employerSocialSecurity ?? 0) +
        Number(input.unemploymentEmployer ?? 0),
    );
    if (Math.abs(expectedEmployerCost - this.round(Number(input.employerCost))) > 0.01) {
      throw new BadRequestException(
        `Employer cost does not reconcile. Expected ${expectedEmployerCost}.`,
      );
    }
    return { employeeDeductions, expectedEmployerCost };
  }

  async upsertItem(periodId: string, input: PayrollItemInput) {
    const { tenantId, companyId } = this.context();
    const branchIds = await this.branchIds();
    const calc = this.validate(input);
    if (branchIds && !branchIds.includes(input.branchId)) {
      throw new ForbiddenException('Payroll item is outside active organization scope.');
    }
    return this.prisma.$transaction(
      async (tx) => {
        const periods = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,status,branch_id AS "branchId" FROM payroll_periods
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT'
             AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))
           FOR UPDATE`,
          periodId,
          tenantId,
          companyId,
          branchIds,
        );
        if (!periods.length) {
          throw new BadRequestException('Only a draft payroll period in active organization scope can be edited.');
        }
        if (periods[0].branchId !== input.branchId) {
          throw new BadRequestException('Payroll item branch must match payroll period branch.');
        }
        const staff = await tx.staff.findFirst({
          where: { id: input.staffId, tenantId, branchId: input.branchId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!staff) throw new NotFoundException('Active staff member not found.');
        if (input.costCenterId) {
          const cc = await tx.$queryRawUnsafe<any[]>(
            `SELECT id FROM cost_centers
             WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND active=true
             LIMIT 1`,
            input.costCenterId,
            tenantId,
            companyId,
          );
          if (!cc.length) throw new BadRequestException('Cost center is not available in company scope.');
        }
        const snapshot = {
          grossAmount: this.round(input.grossAmount),
          netAmount: this.round(input.netAmount),
          incomeTax: this.round(input.incomeTax ?? 0),
          stampTax: this.round(input.stampTax ?? 0),
          employeeSocialSecurity: this.round(input.employeeSocialSecurity ?? 0),
          unemploymentEmployee: this.round(input.unemploymentEmployee ?? 0),
          employerSocialSecurity: this.round(input.employerSocialSecurity ?? 0),
          unemploymentEmployer: this.round(input.unemploymentEmployer ?? 0),
          otherDeductions: this.round(input.otherDeductions ?? 0),
          employerCost: this.round(input.employerCost),
        };
        const rows = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO payroll_items(tenant_id,company_id,branch_id,period_id,staff_id,cost_center_id,gross_amount,net_amount,deductions,employer_cost,income_tax,stamp_tax,employee_social_security,unemployment_employee,employer_social_security,unemployment_employer,other_deductions,calculation_snapshot,status,note)
           VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,'DRAFT',$19)
           ON CONFLICT(period_id,staff_id) DO UPDATE SET branch_id=EXCLUDED.branch_id,company_id=EXCLUDED.company_id,cost_center_id=EXCLUDED.cost_center_id,gross_amount=EXCLUDED.gross_amount,net_amount=EXCLUDED.net_amount,deductions=EXCLUDED.deductions,employer_cost=EXCLUDED.employer_cost,income_tax=EXCLUDED.income_tax,stamp_tax=EXCLUDED.stamp_tax,employee_social_security=EXCLUDED.employee_social_security,unemployment_employee=EXCLUDED.unemployment_employee,employer_social_security=EXCLUDED.employer_social_security,unemployment_employer=EXCLUDED.unemployment_employer,other_deductions=EXCLUDED.other_deductions,calculation_snapshot=EXCLUDED.calculation_snapshot,note=EXCLUDED.note,updated_at=NOW()
           RETURNING *`,
          tenantId,
          companyId,
          input.branchId,
          periodId,
          input.staffId,
          input.costCenterId ?? null,
          snapshot.grossAmount,
          snapshot.netAmount,
          calc.employeeDeductions,
          snapshot.employerCost,
          snapshot.incomeTax,
          snapshot.stampTax,
          snapshot.employeeSocialSecurity,
          snapshot.unemploymentEmployee,
          snapshot.employerSocialSecurity,
          snapshot.unemploymentEmployer,
          snapshot.otherDeductions,
          JSON.stringify(snapshot),
          input.note ?? null,
        );
        return rows[0];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async submit(periodId: string, userId?: string) {
    const { tenantId, companyId } = this.context();
    const branchIds = await this.branchIds();

    return this.prisma.$transaction(
      async (tx) => {
        const periods = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,year,month,status,branch_id AS "branchId"
           FROM payroll_periods
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT'
             AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))
           FOR UPDATE`,
          periodId,
          tenantId,
          companyId,
          branchIds,
        );
        if (!periods.length) throw new BadRequestException('Taslak bordro dönemi bulunamadı.');
        const period = periods[0];
        if (!period.branchId) throw new BadRequestException('Bordro gönderimi için şubeye bağlı dönem gereklidir.');

        const closures = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,staff_count AS "staffCount"
           FROM hr_attendance_period_closures
           WHERE tenant_id=$1::text AND company_id=$2::text AND branch_id=$3::text
             AND payroll_period_id=$4::text AND year=$5 AND month=$6 AND status='CLOSED'
           LIMIT 1`,
          tenantId,
          companyId,
          period.branchId,
          periodId,
          Number(period.year),
          Number(period.month),
        );
        if (!closures.length) {
          throw new BadRequestException('Bordro gönderilemez: ilgili ayın puantaj kapanışı tamamlanmamış.');
        }
        const closure = closures[0];

        const counts = await tx.$queryRawUnsafe<any[]>(
          `SELECT
             COUNT(*)::int AS "itemCount",
             COUNT(*) FILTER(
               WHERE calculation_snapshot->'workInputs'->>'source'='ATTENDANCE_PERIOD_CLOSE'
                 AND calculation_snapshot->'workInputs'->>'closureId'=$5::text
             )::int AS "workInputCount",
             COUNT(*) FILTER(
               WHERE calculation_snapshot ? 'grossAmount'
                 AND calculation_snapshot ? 'netAmount'
                 AND calculation_snapshot ? 'employerCost'
                 AND calculation_snapshot->'salaryContract'->>'salaryBasis'='MONTHLY_NET'
                 AND calculation_snapshot->'legalCalculation'->>'source'='NET_CONTRACT_LEGAL_ENGINE'
                 AND calculation_snapshot->'netCompensationAdjustment'->>'source'='NET_CONTRACT_POLICY'
             )::int AS "financialSnapshotCount"
           FROM payroll_items
           WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text`,
          periodId,
          tenantId,
          companyId,
          period.branchId,
          closure.id,
        );
        const summary = counts[0] ?? {};
        const itemCount = Number(summary.itemCount ?? 0);
        const staffCount = Number(closure.staffCount ?? 0);
        const workInputCount = Number(summary.workInputCount ?? 0);
        const financialSnapshotCount = Number(summary.financialSnapshotCount ?? 0);

        if (itemCount !== staffCount) {
          throw new BadRequestException(
            `Bordro gönderilemez: kapanışta ${staffCount} personel var, taslak bordroda ${itemCount} personel kalemi bulunuyor.`,
          );
        }
        if (workInputCount !== itemCount) {
          throw new BadRequestException(
            `Bordro gönderilemez: ${itemCount - workInputCount} personelin kapanmış puantaj girdisi bordroya bağlanmamış.`,
          );
        }
        if (financialSnapshotCount !== itemCount) {
          throw new BadRequestException(
            `Bordro gönderilemez: ${itemCount - financialSnapshotCount} personelin parasal bordro hesabı tamamlanmamış.`,
          );
        }

        const updated = await tx.$executeRawUnsafe(
          `UPDATE payroll_periods
           SET status='SUBMITTED',updated_at=NOW()
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='DRAFT'
             AND branch_id=$4::text`,
          periodId,
          tenantId,
          companyId,
          period.branchId,
        );
        if (updated !== 1) throw new BadRequestException('Bordro dönemi eşzamanlı olarak değiştirildi.');

        await this.ensurePayrollApprovalWorkflow(tx,userId??this.tenant.getContext().userId??'system');
        const approval=await this.approvalRuntime.createWithinTransaction({
          workflowKey:'hr.payroll-period-approval',
          entityType:'hr_payroll_period',
          entityId:periodId,
          branchId:period.branchId,
          reason:`Bordro ${period.year}/${String(period.month).padStart(2,'0')} onayı`,
          payload:{
            periodId,
            year:Number(period.year),
            month:Number(period.month),
            branchId:period.branchId,
            staffCount,
            payrollItemCount:itemCount,
          },
        },tx);

        return {
          periodId,
          status: 'SUBMITTED',
          approvalRequestId: approval.id,
          staffCount,
          payrollItemCount: itemCount,
          closedAttendanceInputCount: workInputCount,
          calculatedPayrollItemCount: financialSnapshotCount,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async approve(periodId: string, userId: string) {
    const { tenantId, companyId } = this.context();
    const branchIds = await this.branchIds();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,branch_id AS "branchId",status FROM payroll_periods
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))
       LIMIT 1`,
      periodId,
      tenantId,
      companyId,
      branchIds,
    );
    if (!rows.length) throw new NotFoundException('Payroll period not found.');
    if (rows[0].status !== 'SUBMITTED') {
      throw new BadRequestException('Only submitted payroll can be approved.');
    }
    await this.assertApprover(userId);
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE payroll_periods
       SET status='APPROVED',approved_by_user_id=$2::text,approved_at=NOW(),updated_at=NOW()
       WHERE id=$1::text AND tenant_id=$3::text AND company_id=$4::text AND status='SUBMITTED'
         AND ($5::text[] IS NULL OR branch_id=ANY($5::text[]))`,
      periodId,
      userId,
      tenantId,
      companyId,
      branchIds,
    );
    if (updated !== 1) throw new BadRequestException('Payroll period changed concurrently.');
    return { periodId, status: 'APPROVED' };
  }

  private async ensureAccount(
    tx: Prisma.TransactionClient,
    tenantId: string,
    companyId: string,
    code: string,
    name: string,
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
  ) {
    const x = await tx.chartOfAccount.findFirst({
      where: { tenantId, companyId, code },
      select: { id: true, active: true },
    });
    if (x) {
      if (!x.active) {
        return tx.chartOfAccount.update({ where: { id: x.id }, data: { active: true }, select: { id: true } });
      }
      return x;
    }
    return tx.chartOfAccount.create({
      data: { tenantId, companyId, code, name, type, active: true },
      select: { id: true },
    });
  }

  async post(periodId: string) {
    const { tenantId, companyId } = this.context();
    const branchIds = await this.branchIds();
    return this.prisma.$transaction(
      async (tx) => {
        const periods = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,year,month,status,branch_id AS "branchId",journal_entry_id AS "journalEntryId"
           FROM payroll_periods
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))
           FOR UPDATE`,
          periodId,
          tenantId,
          companyId,
          branchIds,
        );
        if (!periods.length) throw new NotFoundException('Payroll period not found.');
        const period = periods[0];
        if (period.status === 'POSTED') {
          return { periodId, status: 'POSTED', journalEntryId: period.journalEntryId, duplicate: true };
        }
        if (period.status !== 'APPROVED') {
          throw new BadRequestException('Only approved payroll can be posted.');
        }
        const items = await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM payroll_items
           WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND branch_id=$4::text
             AND ($5::text[] IS NULL OR branch_id=ANY($5::text[]))
           ORDER BY id FOR UPDATE`,
          periodId,
          tenantId,
          companyId,
          period.branchId,
          branchIds,
        );
        if (!items.length) throw new BadRequestException('Payroll period has no scoped items.');
        let expense = 0;
        let net = 0;
        let taxes = 0;
        let social = 0;
        let other = 0;
        for (const i of items) {
          expense = this.round(expense + Number(i.employer_cost));
          net = this.round(net + Number(i.net_amount));
          taxes = this.round(taxes + Number(i.income_tax) + Number(i.stamp_tax));
          social = this.round(
            social +
              Number(i.employee_social_security) +
              Number(i.unemployment_employee) +
              Number(i.employer_social_security) +
              Number(i.unemployment_employer),
          );
          other = this.round(other + Number(i.other_deductions));
        }
        const credits = this.round(net + taxes + social + other);
        if (Math.abs(expense - credits) > 0.01) {
          throw new BadRequestException(
            `Payroll journal is not balanced. Expense ${expense}, liabilities ${credits}.`,
          );
        }
        const expenseAcc = await this.ensureAccount(
          tx,
          tenantId,
          companyId,
          '770',
          'Genel Yönetim Giderleri - Personel',
          'EXPENSE',
        );
        const personnel = await this.ensureAccount(
          tx,
          tenantId,
          companyId,
          '335',
          'Personele Borçlar',
          'LIABILITY',
        );
        const tax = await this.ensureAccount(
          tx,
          tenantId,
          companyId,
          '360',
          'Ödenecek Vergi ve Fonlar',
          'LIABILITY',
        );
        const socialAcc = await this.ensureAccount(
          tx,
          tenantId,
          companyId,
          '361',
          'Ödenecek Sosyal Güvenlik Kesintileri',
          'LIABILITY',
        );
        const otherAcc =
          other > 0
            ? await this.ensureAccount(
                tx,
                tenantId,
                companyId,
                '369',
                'Ödenecek Diğer Yükümlülükler',
                'LIABILITY',
              )
            : null;
        const now = new Date();
        const entry = await tx.journalEntry.create({
          data: {
            tenantId,
            companyId,
            branchId: period.branchId,
            number: this.journalNumber(now),
            status: 'POSTED',
            entryDate: now,
            description: `Bordro ${period.year}/${String(period.month).padStart(2, '0')}`,
            referenceType: 'PAYROLL_PERIOD',
            referenceId: periodId,
            postedAt: now,
            lines: {
              create: [
                {
                  accountId: expenseAcc.id,
                  debit: expense,
                  credit: 0,
                  memo: 'Brüt ücret ve işveren maliyetleri',
                },
                { accountId: personnel.id, debit: 0, credit: net, memo: 'Net ücret borcu' },
                ...(taxes > 0
                  ? [{ accountId: tax.id, debit: 0, credit: taxes, memo: 'Vergi ve damga vergisi' }]
                  : []),
                ...(social > 0
                  ? [
                      {
                        accountId: socialAcc.id,
                        debit: 0,
                        credit: social,
                        memo: 'SGK ve işsizlik yükümlülükleri',
                      },
                    ]
                  : []),
                ...(other > 0 && otherAcc
                  ? [{ accountId: otherAcc.id, debit: 0, credit: other, memo: 'Diğer bordro kesintileri' }]
                  : []),
              ],
            },
          },
        });
        const expenseLine = await tx.journalEntryLine.findFirst({
          where: { journalEntryId: entry.id, accountId: expenseAcc.id },
          select: { id: true },
        });
        if (expenseLine) {
          const centers = [...new Set(items.map((i) => i.cost_center_id).filter(Boolean))];
          if (centers.length === 1) {
            await tx.$executeRawUnsafe(
              `INSERT INTO cost_center_expense_links(journal_entry_line_id,cost_center_id)
               VALUES($1::text,$2::text)
               ON CONFLICT(journal_entry_line_id) DO UPDATE SET cost_center_id=EXCLUDED.cost_center_id`,
              expenseLine.id,
              centers[0],
            );
          }
        }
        await tx.$executeRawUnsafe(
          `UPDATE payroll_items
           SET status='POSTED',updated_at=NOW()
           WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND branch_id=$4::text
             AND ($5::text[] IS NULL OR branch_id=ANY($5::text[]))`,
          periodId,
          tenantId,
          companyId,
          period.branchId,
          branchIds,
        );
        await tx.$executeRawUnsafe(
          `UPDATE payroll_periods
           SET status='POSTED',posted_at=NOW(),journal_entry_id=$2::text,updated_at=NOW()
           WHERE id=$1::text AND tenant_id=$3::text AND company_id=$4::text
             AND branch_id=$5::text
             AND ($6::text[] IS NULL OR branch_id=ANY($6::text[]))`,
          periodId,
          entry.id,
          tenantId,
          companyId,
          period.branchId,
          branchIds,
        );
        return {
          periodId,
          status: 'POSTED',
          journalEntryId: entry.id,
          totals: {
            employerCost: expense,
            netPayable: net,
            taxesPayable: taxes,
            socialSecurityPayable: social,
            otherPayables: other,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
