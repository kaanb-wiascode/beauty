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

  async close(id: string, actorId: string, reason?: string) {
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
