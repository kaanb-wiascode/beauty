import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

interface PosScope {
  tenantId: string;
  companyId: string;
  branchId: string | null;
}

@Injectable()
export class PosSalePaymentLinkageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private context(): PosScope {
    return {
      tenantId: this.tenant.getTenantId(),
      companyId: this.tenant.getCompanyId(),
      branchId: this.tenant.getBranchId(),
    };
  }

  async link(posTransactionId: string, salePaymentId: string, note = 'MANUAL') {
    return this.linkInScope(this.context(), posTransactionId, salePaymentId, note);
  }

  async linkInScope(ctx: PosScope, posTransactionId: string, salePaymentId: string, note = 'AUTO') {
    return this.prisma.$transaction(async (tx) => {
      const posRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT p.id,p.sale_payment_id AS "salePaymentId",p.sale_id AS "saleId",p.amount,p.currency,p.status,p.branch_id AS "branchId"
         FROM pos_transactions p
         WHERE p.id=$1::text AND p.tenant_id=$2::text AND p.company_id=$3::text
           AND ($4::text IS NULL OR p.branch_id=$4::text)
         FOR UPDATE`,
        posTransactionId,
        ctx.tenantId,
        ctx.companyId,
        ctx.branchId,
      );
      if (!posRows.length) throw new NotFoundException('POS transaction not found.');
      const pos = posRows[0];
      if (!['AUTHORIZED','CAPTURED'].includes(pos.status)) {
        throw new BadRequestException('Only authorized or captured POS transactions can be linked.');
      }
      if (pos.salePaymentId && pos.salePaymentId !== salePaymentId) {
        throw new BadRequestException('POS transaction is already linked to another sale payment.');
      }
      if (!pos.branchId) {
        throw new BadRequestException('POS transaction must belong to a branch before linking a sale payment.');
      }

      const payment = await tx.salePayment.findFirst({
        where: {
          id: salePaymentId,
          tenantId: ctx.tenantId,
          branchId: pos.branchId,
          status: 'COMPLETED',
        },
        include: { sale: { select: { id: true } } },
      });
      if (!payment) throw new NotFoundException('Sale payment not found in the active scope.');
      if (payment.method !== 'CARD') throw new BadRequestException('Only card sale payments can be linked to POS transactions.');
      if (Math.abs(Number(payment.amount) - Number(pos.amount)) > 0.01) {
        throw new BadRequestException('Sale payment and POS transaction amounts do not match.');
      }

      await tx.$executeRawUnsafe(
        `UPDATE pos_transactions
         SET sale_payment_id=$2::text,sale_id=$3::text,updated_at=NOW()
         WHERE id=$1::text`,
        posTransactionId,
        payment.id,
        payment.sale.id,
      );
      return { posTransactionId, salePaymentId: payment.id, saleId: payment.sale.id, linkType: note };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async correlateProviderReferenceInScope(
    ctx: PosScope,
    providerTransactionId: string,
    merchantReference?: string,
  ) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; salePaymentId: string | null }>>(
      `SELECT p.id,p.sale_payment_id AS "salePaymentId"
       FROM pos_transactions p
       WHERE p.tenant_id=$1::text AND p.company_id=$2::text
         AND ($3::text IS NULL OR p.branch_id=$3::text)
         AND p.provider_transaction_id=$4
       ORDER BY p.created_at DESC
       LIMIT 2`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      providerTransactionId,
    );
    if (rows.length !== 1) {
      return { linked: false, reason: rows.length ? 'AMBIGUOUS_POS_TRANSACTION' : 'NEEDS_ENRICHMENT' };
    }
    const pos = rows[0];
    if (pos.salePaymentId) {
      return { linked: true, reason: 'ALREADY_LINKED', posTransactionId: pos.id, salePaymentId: pos.salePaymentId };
    }
    if (!merchantReference?.trim()) {
      return this.autoLinkOneInScope(ctx, pos.id);
    }

    const exact = await this.prisma.salePayment.findMany({
      where: {
        tenantId: ctx.tenantId,
        method: 'CARD',
        status: 'COMPLETED',
        reference: merchantReference.trim(),
        ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
      },
      select: { id: true },
      take: 2,
    });
    if (exact.length !== 1) {
      return { linked: false, reason: exact.length ? 'AMBIGUOUS_MERCHANT_REFERENCE' : 'MERCHANT_REFERENCE_NOT_FOUND', posTransactionId: pos.id };
    }
    try {
      const result = await this.linkInScope(ctx, pos.id, exact[0].id, 'PROVIDER_MERCHANT_REFERENCE');
      return { linked: true, reason: 'PROVIDER_MERCHANT_REFERENCE', ...result };
    } catch {
      return { linked: false, reason: 'LINK_REJECTED', posTransactionId: pos.id };
    }
  }

  async autoLinkOneInScope(ctx: PosScope, posTransactionId: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT p.id,p.amount,p.provider_transaction_id AS "providerTransactionId",p.created_at AS "createdAt",
              p.branch_id AS "branchId",p.sale_payment_id AS "salePaymentId",p.status
       FROM pos_transactions p
       WHERE p.id=$1::text AND p.tenant_id=$2::text AND p.company_id=$3::text
         AND ($4::text IS NULL OR p.branch_id=$4::text)
       LIMIT 1`,
      posTransactionId,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
    );
    if (!rows.length) return { linked: false, reason: 'NOT_FOUND' };
    const row = rows[0];
    if (row.salePaymentId) return { linked: true, reason: 'ALREADY_LINKED', salePaymentId: row.salePaymentId };
    if (!['AUTHORIZED','CAPTURED'].includes(row.status)) return { linked: false, reason: 'STATUS' };
    if (!row.branchId) return { linked: false, reason: 'BRANCH_REQUIRED' };

    const exact = await this.prisma.salePayment.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: row.branchId,
        method: 'CARD',
        status: 'COMPLETED',
        reference: row.providerTransactionId,
      },
      select: { id: true },
      take: 2,
    });

    let candidateId = exact.length === 1 ? exact[0].id : null;
    let linkType = 'WEBHOOK_REFERENCE';
    if (!candidateId) {
      const from = new Date(new Date(row.createdAt).getTime() - 30 * 60 * 1000);
      const to = new Date(new Date(row.createdAt).getTime() + 30 * 60 * 1000);
      const candidates = await this.prisma.salePayment.findMany({
        where: {
          tenantId: ctx.tenantId,
          branchId: row.branchId,
          method: 'CARD',
          status: 'COMPLETED',
          amount: new Prisma.Decimal(row.amount),
          paidAt: { gte: from, lte: to },
        },
        select: { id: true },
        take: 2,
      });
      if (candidates.length === 1) {
        candidateId = candidates[0].id;
        linkType = 'WEBHOOK_AMOUNT_TIME';
      }
    }

    if (!candidateId) return { linked: false, reason: 'AMBIGUOUS_OR_MISSING' };
    try {
      const result = await this.linkInScope(ctx, row.id, candidateId, linkType);
      return { linked: true, reason: linkType, ...result };
    } catch {
      return { linked: false, reason: 'LINK_REJECTED' };
    }
  }

  async autoLink(limit = 200) {
    const ctx = this.context();
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT p.id
       FROM pos_transactions p
       WHERE p.tenant_id=$1::text AND p.company_id=$2::text
         AND ($3::text IS NULL OR p.branch_id=$3::text)
         AND p.sale_payment_id IS NULL
         AND p.status IN ('AUTHORIZED','CAPTURED')
       ORDER BY p.created_at ASC LIMIT $4`,
      ctx.tenantId,
      ctx.companyId,
      ctx.branchId,
      Math.min(Math.max(limit, 1), 500),
    );

    let linked = 0;
    let skipped = 0;
    for (const row of rows) {
      const result = await this.autoLinkOneInScope(ctx, row.id);
      if (result.linked) linked += 1;
      else skipped += 1;
    }
    return { scanned: rows.length, linked, skipped };
  }
}
