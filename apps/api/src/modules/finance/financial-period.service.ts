import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

@Injectable()
export class FinancialPeriodService {
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

  async list() {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe(
      `SELECT id,name,starts_at AS "startsAt",ends_at AS "endsAt",status::text AS status,
              branch_id AS "branchId",closed_by AS "closedBy",closed_at AS "closedAt",
              reopened_by AS "reopenedBy",reopened_at AS "reopenedAt",close_reason AS "closeReason",
              created_by AS "createdBy",created_at AS "createdAt",updated_at AS "updatedAt"
       FROM financial_periods
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND ($3::text IS NULL OR branch_id IS NULL OR branch_id=$3::text)
       ORDER BY starts_at DESC`,
      tenantId, companyId, branchId,
    );
  }

  async create(input: { name: string; startsAt: Date; endsAt: Date }, actorId: string) {
    const { tenantId, companyId, branchId } = this.context();
    if (input.startsAt > input.endsAt) throw new BadRequestException('Dönem başlangıcı bitiş tarihinden sonra olamaz.');
    const overlap = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM financial_periods
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND COALESCE(branch_id,'')=COALESCE($3::text,'')
         AND starts_at <= $5::timestamptz AND ends_at >= $4::timestamptz
       LIMIT 1`,
      tenantId, companyId, branchId, input.startsAt, input.endsAt,
    );
    if (overlap.length) throw new BadRequestException('Aynı kapsamda bu tarihlerle çakışan bir finansal dönem zaten var.');

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO financial_periods(
         id,tenant_id,company_id,branch_id,name,starts_at,ends_at,status,created_by,created_at,updated_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,$6,$7,'OPEN',$8::text,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       RETURNING id,name,starts_at AS "startsAt",ends_at AS "endsAt",status::text AS status,branch_id AS "branchId"`,
      randomUUID(), tenantId, companyId, branchId, input.name.trim(), input.startsAt, input.endsAt, actorId,
    );
    return rows[0];
  }


  private async getPeriod(id: string) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,name,starts_at AS "startsAt",ends_at AS "endsAt",status::text AS status,branch_id AS "branchId"
       FROM financial_periods
       WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
         AND ($4::text IS NULL OR branch_id IS NULL OR branch_id=$4::text)
       LIMIT 1`,
      id, tenantId, companyId, branchId,
    );
    if (!rows.length) throw new NotFoundException('Finansal dönem bulunamadı.');
    return rows[0];
  }

  async closeChecklist(id: string) {
    const { tenantId, companyId } = this.context();
    const period = await this.getPeriod(id);
    const scopeBranchId = period.branchId ?? null;
    const [journals, income, expenses, bank, pos, balance] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
         FROM journal_entries
         WHERE "tenantId"=$1::text AND "companyId"=$2::text
           AND ($3::text IS NULL OR "branchId"=$3::text)
           AND "entryDate" BETWEEN $4::timestamptz AND $5::timestamptz
           AND status IN ('DRAFT','SUBMITTED','APPROVED')`,
        tenantId, companyId, scopeBranchId, period.startsAt, period.endsAt,
      ),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
         FROM income_records
         WHERE tenant_id=$1::text AND company_id=$2::text
           AND ($3::text IS NULL OR branch_id=$3::text)
           AND transaction_date BETWEEN $4::timestamptz AND $5::timestamptz
           AND approval_status='APPROVED' AND accounting_status<>'POSTED'`,
        tenantId, companyId, scopeBranchId, period.startsAt, period.endsAt,
      ),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
         FROM expenses
         WHERE tenant_id=$1::text AND company_id=$2::text
           AND ($3::text IS NULL OR branch_id=$3::text)
           AND transaction_date BETWEEN $4::timestamptz AND $5::timestamptz
           AND approval_status='APPROVED' AND accounting_status<>'POSTED'`,
        tenantId, companyId, scopeBranchId, period.startsAt, period.endsAt,
      ),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
         FROM bank_transactions
         WHERE tenant_id=$1::text AND company_id=$2::text
           AND ($3::text IS NULL OR branch_id=$3::text)
           AND booked_at BETWEEN $4::timestamptz AND $5::timestamptz
           AND reconciliation_status NOT IN ('MATCHED','IGNORED')`,
        tenantId, companyId, scopeBranchId, period.startsAt, period.endsAt,
      ),
      this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
         FROM pos_transactions
         WHERE tenant_id=$1::text AND company_id=$2::text
           AND ($3::text IS NULL OR branch_id=$3::text)
           AND created_at BETWEEN $4::timestamptz AND $5::timestamptz
           AND status='CAPTURED' AND settled_at IS NULL`,
        tenantId, companyId, scopeBranchId, period.startsAt, period.endsAt,
      ),
      this.prisma.$queryRawUnsafe<Array<{ debit: unknown; credit: unknown }>>(
        `SELECT COALESCE(SUM(jel.debit),0)::numeric AS debit,
                COALESCE(SUM(jel.credit),0)::numeric AS credit
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id=jel."journalEntryId"
         WHERE je."tenantId"=$1::text AND je."companyId"=$2::text
           AND ($3::text IS NULL OR je."branchId"=$3::text)
           AND je."entryDate" BETWEEN $4::timestamptz AND $5::timestamptz
           AND je.status='POSTED'`,
        tenantId, companyId, scopeBranchId, period.startsAt, period.endsAt,
      ),
    ]);

    const debit = Number(balance[0]?.debit ?? 0);
    const credit = Number(balance[0]?.credit ?? 0);
    const trialVariance = Math.round((debit - credit + Number.EPSILON) * 100) / 100;
    const checks = [
      { code: 'OPEN_JOURNALS', label: 'Tamamlanmamış yevmiye kayıtları', count: Number(journals[0]?.count ?? 0), blocking: true },
      { code: 'UNPOSTED_INCOME', label: 'Muhasebeleştirilmemiş onaylı gelirler', count: Number(income[0]?.count ?? 0), blocking: true },
      { code: 'UNPOSTED_EXPENSES', label: 'Muhasebeleştirilmemiş onaylı giderler', count: Number(expenses[0]?.count ?? 0), blocking: true },
      { code: 'UNRECONCILED_BANK', label: 'Mutabakat bekleyen banka hareketleri', count: Number(bank[0]?.count ?? 0), blocking: true },
      { code: 'UNSETTLED_POS', label: 'Hesaba geçmemiş POS hareketleri', count: Number(pos[0]?.count ?? 0), blocking: false },
      { code: 'TRIAL_BALANCE_VARIANCE', label: 'Mizan farkı', count: Math.abs(trialVariance), blocking: true },
    ];
    return {
      period,
      closable: checks.every((check) => !check.blocking || check.count === 0),
      blockingCount: checks.filter((check) => check.blocking && check.count !== 0).length,
      checks,
      trialBalance: { debit, credit, variance: trialVariance },
    };
  }

  async close(id: string, actorId: string, reason?: string) {
    const checklist = await this.closeChecklist(id);
    if (!checklist.closable) {
      const labels = checklist.checks
        .filter((check) => check.blocking && check.count !== 0)
        .map((check) => check.label)
        .join(', ');
      throw new BadRequestException(`Finansal dönem kapatılamaz. Önce şu kontrolleri tamamlayın: ${labels}.`);
    }
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE financial_periods
       SET status='CLOSED',closed_by=$1::text,closed_at=CURRENT_TIMESTAMP,close_reason=$2,updated_at=CURRENT_TIMESTAMP
       WHERE id=$3::text AND tenant_id=$4::text AND company_id=$5::text
         AND ($6::text IS NULL OR branch_id IS NULL OR branch_id=$6::text)
       RETURNING id,name,status::text AS status,closed_at AS "closedAt"`,
      actorId, reason?.trim() || null, id, tenantId, companyId, branchId,
    );
    if (!rows.length) throw new NotFoundException('Finansal dönem bulunamadı.');
    return rows[0];
  }

  async reopen(id: string, actorId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `UPDATE financial_periods
       SET status='OPEN',reopened_by=$1::text,reopened_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
       WHERE id=$2::text AND tenant_id=$3::text AND company_id=$4::text
         AND ($5::text IS NULL OR branch_id IS NULL OR branch_id=$5::text)
       RETURNING id,name,status::text AS status,reopened_at AS "reopenedAt"`,
      actorId, id, tenantId, companyId, branchId,
    );
    if (!rows.length) throw new NotFoundException('Finansal dönem bulunamadı.');
    return rows[0];
  }
}
