import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { OrganizationScopeService } from '../../common/tenant/organization-scope.service';

@Injectable()
export class PayrollReversalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly organizationScope: OrganizationScopeService,
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

  private async assertAuthority(userId: string) {
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
    if (!actor) throw new ForbiddenException('Actor has no active membership.');
    const roles = new Set([this.role(actor.roleSlug), this.role(actor.roleName)]);
    const allowed = [
      'hr-manager',
      'human-resources-manager',
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
    if (!allowed.some((r) => roles.has(r))) {
      throw new ForbiddenException(
        'Payroll cancellation/reversal requires HR, finance or management authority.',
      );
    }
  }

  async cancel(periodId: string, userId: string, reason: string) {
    const clean = (reason ?? '').trim();
    if (clean.length < 5) {
      throw new BadRequestException('Cancellation reason must contain at least 5 characters.');
    }
    const { tenantId, companyId } = this.context();
    const branchIds = await this.branchIds();
    const periods = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,status,branch_id AS "branchId" FROM payroll_periods
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))
       LIMIT 1`,
      periodId,
      tenantId,
      companyId,
      branchIds,
    );
    if (!periods.length) throw new NotFoundException('Payroll period not found.');
    if (periods[0].status === 'CANCELLED') {
      return { periodId, status: 'CANCELLED', duplicate: true };
    }
    if (periods[0].status === 'POSTED' || periods[0].status === 'REVERSED') {
      throw new BadRequestException('Posted payroll must be reversed instead of cancelled.');
    }
    await this.assertAuthority(userId);
    const changed = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRawUnsafe<any[]>(
          `SELECT status,branch_id AS "branchId" FROM payroll_periods
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))
           FOR UPDATE`,
          periodId,
          tenantId,
          companyId,
          branchIds,
        );
        if (!locked.length) throw new NotFoundException('Payroll period not found.');
        if (locked[0].status === 'CANCELLED') return false;
        if (!['DRAFT', 'SUBMITTED', 'APPROVED'].includes(locked[0].status)) {
          throw new BadRequestException('Payroll period can no longer be cancelled.');
        }
        await tx.$executeRawUnsafe(
          `UPDATE payroll_periods
           SET status='CANCELLED',cancelled_at=NOW(),cancelled_by_user_id=$2::text,cancellation_reason=$3,updated_at=NOW()
           WHERE id=$1::text AND tenant_id=$4::text AND company_id=$5::text
             AND ($6::text[] IS NULL OR branch_id=ANY($6::text[]))`,
          periodId,
          userId,
          clean,
          tenantId,
          companyId,
          branchIds,
        );
        await tx.$executeRawUnsafe(
          `UPDATE payroll_items
           SET status='CANCELLED',updated_at=NOW()
           WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))`,
          periodId,
          tenantId,
          companyId,
          branchIds,
        );
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { periodId, status: 'CANCELLED', duplicate: !changed };
  }

  async reverse(periodId: string, userId: string, reason: string) {
    const clean = (reason ?? '').trim();
    if (clean.length < 5) {
      throw new BadRequestException('Reversal reason must contain at least 5 characters.');
    }
    const { tenantId, companyId } = this.context();
    const branchIds = await this.branchIds();
    const pre = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,status,branch_id AS "branchId",reversal_journal_entry_id AS "reversalJournalEntryId"
       FROM payroll_periods
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))
       LIMIT 1`,
      periodId,
      tenantId,
      companyId,
      branchIds,
    );
    if (!pre.length) throw new NotFoundException('Payroll period not found.');
    if (pre[0].status === 'REVERSED') {
      return {
        periodId,
        status: 'REVERSED',
        journalEntryId: pre[0].reversalJournalEntryId,
        duplicate: true,
      };
    }
    if (pre[0].status !== 'POSTED') {
      throw new BadRequestException('Only posted payroll can be reversed.');
    }
    await this.assertAuthority(userId);

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,year,month,status,branch_id AS "branchId",journal_entry_id AS "journalEntryId",reversal_journal_entry_id AS "reversalJournalEntryId"
           FROM payroll_periods
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))
           FOR UPDATE`,
          periodId,
          tenantId,
          companyId,
          branchIds,
        );
        if (!rows.length) throw new NotFoundException('Payroll period not found.');
        const period = rows[0];
        if (period.status === 'REVERSED') {
          return {
            periodId,
            status: 'REVERSED',
            journalEntryId: period.reversalJournalEntryId,
            duplicate: true,
          };
        }
        if (period.status !== 'POSTED' || !period.journalEntryId) {
          throw new BadRequestException('Posted payroll journal is required.');
        }
        const settlement = await tx.$queryRawUnsafe<any[]>(
          `SELECT
             (SELECT COUNT(*)::int FROM salary_payments
              WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='PAID'
                AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))) AS salary_count,
             (SELECT COUNT(*)::int FROM payroll_liability_payments
              WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND status='PAID'
                AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))) AS liability_count`,
          periodId,
          tenantId,
          companyId,
          branchIds,
        );
        if (
          Number(settlement[0]?.salary_count ?? 0) > 0 ||
          Number(settlement[0]?.liability_count ?? 0) > 0
        ) {
          throw new BadRequestException(
            'Payroll has settlements. Reverse salary/liability payments before reversing payroll.',
          );
        }
        const original = await tx.journalEntry.findFirst({
          where: {
            id: period.journalEntryId,
            tenantId,
            companyId,
            status: 'POSTED',
            ...(period.branchId ? { branchId: period.branchId } : {}),
          },
          include: { lines: true },
        });
        if (!original || !original.lines.length) {
          throw new BadRequestException('Original payroll journal is missing.');
        }
        const now = new Date();
        const reversal = await tx.journalEntry.create({
          data: {
            tenantId,
            companyId,
            branchId: period.branchId ?? null,
            number: this.journalNumber(now),
            status: 'POSTED',
            entryDate: now,
            description: `Bordro ters kaydı ${period.year}/${String(period.month).padStart(2, '0')}: ${clean}`,
            referenceType: 'PAYROLL_REVERSAL',
            referenceId: periodId,
            postedAt: now,
            lines: {
              create: original.lines.map((line) => ({
                accountId: line.accountId,
                debit: line.credit,
                credit: line.debit,
                memo: `Ters kayıt: ${line.memo ?? 'bordro'}`,
              })),
            },
          },
        });
        await tx.$executeRawUnsafe(
          `UPDATE payroll_periods
           SET status='REVERSED',reversed_at=NOW(),reversed_by_user_id=$2::text,reversal_reason=$3,reversal_journal_entry_id=$4::text,updated_at=NOW()
           WHERE id=$1::text AND tenant_id=$5::text AND company_id=$6::text
             AND ($7::text[] IS NULL OR branch_id=ANY($7::text[]))`,
          periodId,
          userId,
          clean,
          reversal.id,
          tenantId,
          companyId,
          branchIds,
        );
        await tx.$executeRawUnsafe(
          `UPDATE payroll_items
           SET status='REVERSED',updated_at=NOW()
           WHERE period_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND ($4::text[] IS NULL OR branch_id=ANY($4::text[]))`,
          periodId,
          tenantId,
          companyId,
          branchIds,
        );
        return { periodId, status: 'REVERSED', journalEntryId: reversal.id, duplicate: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
