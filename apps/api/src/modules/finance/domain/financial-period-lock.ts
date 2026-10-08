import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@beauty-erp/database';

export async function assertFinancialPeriodOpen(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; companyId: string; branchId: string | null; date: Date },
) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; name: string; status: string }>>(
    `SELECT id,name,status::text AS status
     FROM financial_periods
     WHERE tenant_id=$1::text AND company_id=$2::text
       AND (branch_id IS NULL OR branch_id=$3::text)
       AND starts_at <= $4::timestamptz AND ends_at >= $4::timestamptz
     ORDER BY CASE WHEN branch_id IS NULL THEN 1 ELSE 0 END ASC, starts_at DESC
     LIMIT 1`,
    input.tenantId,
    input.companyId,
    input.branchId,
    input.date,
  );
  const period = rows[0];
  if (period?.status === 'CLOSED') {
    throw new BadRequestException(
      `Bu işlem tarihi kapalı finansal döneme aittir: ${period.name}. Dönem yeniden açılmadan finansal kayıt değiştirilemez.`,
    );
  }
}
