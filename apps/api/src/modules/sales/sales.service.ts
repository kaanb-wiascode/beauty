import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';
import { AccountingService } from '../accounting/accounting.service';
import { CommerceFinanceSyncService } from '../finance/commerce-finance-sync.service';
import { calculateSaleTotals } from '../commerce/domain/sale-calculator';
import { InstallmentsService } from '../installments/installments.service';

interface SaleItemInput {
  type: 'SERVICE' | 'PACKAGE';
  referenceId: string;
  quantity: number;
}

interface CreateSaleInput {
  customerId: string;
  discountTotal: number;
  items: SaleItemInput[];
}

interface CreateSaleFromOpportunityInput {
  version: number;
  customerId?: string;
  discountTotal: number;
  items: SaleItemInput[];
}

interface AddSalePaymentInput {
  amount: number;
  method: 'CASH' | 'CARD' | 'TRANSFER';
  reference?: string;
  note?: string;
}

interface RefundSalePaymentInput {
  reason: string;
}

type SaleLine = {
  type: 'SERVICE' | 'PACKAGE';
  serviceId: string | null;
  packageId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
};

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly installmentsService: InstallmentsService,
    private readonly accountingService: AccountingService,
    private readonly commerceFinanceSync: CommerceFinanceSyncService,
  ) {}

  private requireBranchId(): string {
    const branchId = this.tenantContext.getBranchId();
    if (!branchId)
      throw new BadRequestException(
        'Bu işlem için önce aktif bir şube seçmelisiniz.',
      );
    return branchId;
  }

  private async currentUserId(
    db: Prisma.TransactionClient | PrismaService,
  ): Promise<string> {
    const context = this.tenantContext.getContext();
    const rows = await db.$queryRawUnsafe<Array<{ userId: string }>>(
      `SELECT "userId" AS "userId"
         FROM memberships
        WHERE id=$1::text AND "tenantId"=$2::text AND "companyId"=$3::text
        LIMIT 1`,
      context.membershipId,
      context.tenantId,
      context.companyId,
    );
    if (!rows[0]?.userId) {
      throw new BadRequestException(
        'Oturum açmış kullanıcı bilgisi bulunamadı.',
      );
    }
    return rows[0].userId;
  }

  private async recordCrmSaleEvent(
    db: Prisma.TransactionClient | PrismaService,
    input: {
      customerId: string;
      branchId: string;
      saleId: string;
      paymentId?: string | null;
      eventType: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const context = this.tenantContext.getContext();
    const actorUserId = await this.currentUserId(db);
    const opportunities = await db.$queryRawUnsafe<
      Array<{ opportunityId: string }>
    >(
      `SELECT id AS "opportunityId" FROM crm_opportunities
        WHERE sale_id=$1::text AND tenant_id=$2::text AND company_id=$3::text
          AND branch_id=$4::text
        LIMIT 1`,
      input.saleId,
      context.tenantId,
      context.companyId,
      input.branchId,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO crm_events(
         tenant_id,company_id,branch_id,customer_id,opportunity_id,sale_id,payment_id,event_type,actor_user_id,metadata
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8,$9::text,$10::jsonb)`,
      context.tenantId,
      context.companyId,
      input.branchId,
      input.customerId,
      opportunities[0]?.opportunityId ?? null,
      input.saleId,
      input.paymentId ?? null,
      input.eventType,
      actorUserId,
      JSON.stringify(input.metadata ?? {}),
    );
  }

  private async resolveSaleLines(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    items: SaleItemInput[],
  ): Promise<SaleLine[]> {
    return Promise.all(
      items.map(async (item) => {
        if (item.type === 'SERVICE') {
          const service = await tx.service.findFirst({
            where: {
              id: item.referenceId,
              tenantId,
              branchId,
              status: 'ACTIVE',
            },
          });
          if (!service)
            throw new BadRequestException(
              'Satıştaki bir veya daha fazla hizmet geçersiz ya da kullanılamıyor.',
            );
          return {
            type: 'SERVICE' as const,
            serviceId: service.id,
            packageId: null,
            description: service.name,
            quantity: item.quantity,
            unitPrice: Number(service.price),
          };
        }

        const servicePackage = await tx.servicePackage.findFirst({
          where: { id: item.referenceId, tenantId, branchId, active: true },
        });
        if (!servicePackage)
          throw new BadRequestException(
            'Satıştaki bir veya daha fazla paket geçersiz ya da kullanılamıyor.',
          );
        return {
          type: 'PACKAGE' as const,
          serviceId: null,
          packageId: servicePackage.id,
          description: servicePackage.name,
          quantity: item.quantity,
          unitPrice: Number(servicePackage.price),
        };
      }),
    );
  }

  private async createSaleRecord(
    tx: Prisma.TransactionClient,
    input: CreateSaleInput,
    tenantId: string,
    branchId: string,
  ) {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, tenantId, branchId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Müşteri bulunamadı.');

    const lines = await this.resolveSaleLines(
      tx,
      tenantId,
      branchId,
      input.items,
    );
    let totals: ReturnType<typeof calculateSaleTotals>;
    try {
      totals = calculateSaleTotals(lines, input.discountTotal);
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const sale = await tx.sale.create({
      data: {
        tenantId,
        branchId,
        customerId: input.customerId,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        total: totals.total,
        items: {
          create: lines.map((line) => ({
            type: line.type,
            serviceId: line.serviceId,
            packageId: line.packageId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.quantity * line.unitPrice,
          })),
        },
      },
      include: { items: true },
    });

    return { sale, lines, totals };
  }

  private async paymentSummary(
    saleId: string,
    tenantId: string,
    branchId: string,
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId, branchId },
      select: { id: true, total: true, status: true },
    });
    if (!sale) throw new NotFoundException('Satış kaydı bulunamadı.');

    const aggregate = await this.prisma.salePayment.aggregate({
      where: { saleId, tenantId, branchId, status: 'COMPLETED' },
      _sum: { amount: true },
    });

    const total = Number(sale.total);
    const paid = Number(aggregate._sum.amount ?? 0);
    const balance = Math.max(
      0,
      Math.round((total - paid + Number.EPSILON) * 100) / 100,
    );

    return {
      saleId: sale.id,
      saleStatus: sale.status,
      total,
      paid,
      balance,
      paymentStatus:
        paid <= 0 ? 'UNPAID' : balance > 0 ? 'PARTIALLY_PAID' : 'PAID',
    };
  }

  async create(input: CreateSaleInput) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();

    return this.prisma.$transaction(
      async (tx) => {
        const { sale } = await this.createSaleRecord(
          tx,
          input,
          tenantId,
          branchId,
        );
        return sale;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createFromOpportunity(
    opportunityId: string,
    input: CreateSaleFromOpportunityInput,
    actorUserId: string,
  ) {
    const tenantId = this.tenantContext.getTenantId();
    const companyId = this.tenantContext.getCompanyId();
    const branchId = this.requireBranchId();

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<
          Array<{
            id: string;
            title: string;
            stage: string;
            version: number;
            customerId: string | null;
            saleId: string | null;
            estimatedValue: Prisma.Decimal | null;
            currency: string;
          }>
        >(
          `SELECT id,title,stage,version,customer_id AS "customerId",sale_id AS "saleId",
                estimated_value AS "estimatedValue",currency
         FROM crm_opportunities
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text
         FOR UPDATE`,
          opportunityId,
          tenantId,
          companyId,
          branchId,
        );

        const opportunity = rows[0];
        if (!opportunity)
          throw new NotFoundException('Satış fırsatı bulunamadı.');

        if (opportunity.saleId) {
          const sale = await tx.sale.findFirst({
            where: { id: opportunity.saleId, tenantId, branchId },
            include: { items: true },
          });
          if (!sale) {
            throw new ConflictException('Bağlı satış kaydı bulunamadı.');
          }
          return { sale, idempotent: true };
        }

        if (opportunity.stage !== 'WON') {
          throw new BadRequestException(
            'Yalnızca kazanılmış satış fırsatları satışa dönüştürülebilir.',
          );
        }
        if (opportunity.version !== input.version) {
          throw new ConflictException(
            'Satış fırsatı başka bir işlem tarafından güncellendi. Lütfen ekranı yenileyin.',
          );
        }

        const customerId = input.customerId ?? opportunity.customerId;
        if (!customerId) {
          throw new BadRequestException(
            'Satış oluşturulmadan önce bir müşteri seçilmelidir.',
          );
        }

        const { sale, lines, totals } = await this.createSaleRecord(
          tx,
          {
            customerId,
            discountTotal: input.discountTotal,
            items: input.items,
          },
          tenantId,
          branchId,
        );

        const convertedAt = new Date();
        const snapshot = {
          opportunityId: opportunity.id,
          opportunityTitle: opportunity.title,
          estimatedValue:
            opportunity.estimatedValue == null
              ? null
              : Number(opportunity.estimatedValue),
          currency: opportunity.currency,
          customerId,
          saleId: sale.id,
          subtotal: Number(totals.subtotal),
          discountTotal: Number(totals.discountTotal),
          total: Number(totals.total),
          items: lines.map((line) => ({
            type: line.type,
            referenceId: line.serviceId ?? line.packageId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.quantity * line.unitPrice,
          })),
        };

        await tx.$executeRawUnsafe(
          `UPDATE crm_opportunities
         SET customer_id=$5::text,sale_id=$6::text,commercial_snapshot=$7::jsonb,
             converted_at=$8::timestamptz,version=version+1,updated_at=NOW()
         WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text AND branch_id=$4::text`,
          opportunity.id,
          tenantId,
          companyId,
          branchId,
          customerId,
          sale.id,
          JSON.stringify(snapshot),
          convertedAt,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO crm_events(
           tenant_id,company_id,branch_id,opportunity_id,event_type,actor_user_id,metadata
         ) VALUES($1::text,$2::text,$3::text,$4::text,'OPPORTUNITY_SALE_CREATED',$5::text,$6::jsonb)`,
          tenantId,
          companyId,
          branchId,
          opportunity.id,
          actorUserId,
          JSON.stringify({ saleId: sale.id, total: Number(totals.total) }),
        );

        return { sale, idempotent: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findAll() {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    return this.prisma.sale.findMany({
      where: { tenantId, branchId },
      include: {
        customer: true,
        items: true,
        customerPackages: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId, branchId },
      include: {
        customer: true,
        items: true,
        payments: { orderBy: { paidAt: 'desc' } },
        installmentPlan: {
          include: { installments: { orderBy: { sequence: 'asc' } } },
        },
        customerPackages: { include: { sessions: true, package: true } },
      },
    });
    if (!sale) throw new NotFoundException('Satış kaydı bulunamadı.');
    return sale;
  }

  async getPaymentSummary(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    return this.paymentSummary(id, tenantId, branchId);
  }

  async addPayment(id: string, input: AddSalePaymentInput) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('Ödeme tutarı sıfırdan büyük olmalıdır.');
    }

    const payment = await this.prisma.$transaction(
      async (tx) => {
        const sales = await tx.$queryRawUnsafe<
          Array<{
            id: string;
            total: Prisma.Decimal;
            status: string;
          }>
        >(
          `SELECT id,total,status::text AS status FROM sales
         WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text
         FOR UPDATE`,
          id,
          tenantId,
          branchId,
        );
        if (!sales.length)
          throw new NotFoundException('Satış kaydı bulunamadı.');
        const sale = sales[0];
        if (sale.status !== 'CONFIRMED') {
          throw new BadRequestException(
            'Yalnızca onaylanmış satışlara ödeme kaydedilebilir.',
          );
        }

        const aggregate = await tx.salePayment.aggregate({
          where: { saleId: sale.id, tenantId, branchId, status: 'COMPLETED' },
          _sum: { amount: true },
        });

        const paid = Number(aggregate._sum.amount ?? 0);
        const total = Number(sale.total);
        const remaining =
          Math.round((total - paid + Number.EPSILON) * 100) / 100;
        const amount = Math.round((input.amount + Number.EPSILON) * 100) / 100;

        if (remaining <= 0) {
          throw new BadRequestException('Satışın tamamı zaten tahsil edilmiş.');
        }
        if (amount > remaining) {
          throw new BadRequestException(
            `Ödeme kalan bakiyeyi aşıyor: ${remaining.toFixed(2)}.`,
          );
        }

        const createdPayment = await tx.salePayment.create({
          data: {
            tenantId,
            branchId,
            saleId: sale.id,
            amount,
            method: input.method,
            reference: input.reference?.trim() || null,
            note: input.note?.trim() || null,
          },
        });

        await this.installmentsService.allocatePayment(
          tx,
          sale.id,
          createdPayment.id,
          amount,
        );
        await this.accountingService.recordSalePayment(
          tx,
          createdPayment.id,
          createdPayment.method,
          {
            tenantId,
            branchId,
            entryDate: createdPayment.paidAt,
            amount,
          },
        );

        const actorId = await this.currentUserId(tx);
        const companyId = this.tenantContext.getCompanyId();
        const saleFinanceRow = await tx.sale.findUnique({
          where: { id: sale.id },
          select: {
            customer: { select: { firstName: true, lastName: true } },
          },
        });
        await this.commerceFinanceSync.syncSalePayment(tx, {
          tenantId,
          companyId,
          branchId,
          saleId: sale.id,
          actorId,
          customerName: saleFinanceRow
            ? `${saleFinanceRow.customer.firstName} ${saleFinanceRow.customer.lastName}`.trim()
            : null,
          amount,
          occurredAt: createdPayment.paidAt,
          paymentId: createdPayment.id,
          method: createdPayment.method,
          reference: createdPayment.reference,
          note: createdPayment.note,
        });

        const saleRow = await tx.sale.findUnique({
          where: { id: sale.id },
          select: { customerId: true },
        });
        if (saleRow) {
          await this.recordCrmSaleEvent(tx, {
            customerId: saleRow.customerId,
            branchId,
            saleId: sale.id,
            paymentId: createdPayment.id,
            eventType: 'SALE_PAYMENT_RECEIVED',
            metadata: {
              amount,
              method: createdPayment.method,
              paidAt: createdPayment.paidAt.toISOString(),
            },
          });
        }
        return createdPayment;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return {
      payment,
      summary: await this.paymentSummary(id, tenantId, branchId),
    };
  }

  async refundPayment(
    saleId: string,
    paymentId: string,
    input: RefundSalePaymentInput,
  ) {
    const tenantId = this.tenantContext.getTenantId();
    const branchId = this.requireBranchId();
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('İade nedeni gereklidir.');

    const payment = await this.prisma.$transaction(
      async (tx) => {
        const sales = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM sales
         WHERE id=$1::text AND "tenantId"=$2::text AND "branchId"=$3::text
         FOR UPDATE`,
          saleId,
          tenantId,
          branchId,
        );
        if (!sales.length) {
          throw new NotFoundException('Satış kaydı bulunamadı.');
        }

        const existing = await tx.salePayment.findFirst({
          where: { id: paymentId, saleId, tenantId, branchId },
        });
        if (!existing) throw new NotFoundException('Satış ödemesi bulunamadı.');
        if (existing.status !== 'COMPLETED') {
          throw new ConflictException(
            'Yalnızca tamamlanmış ödemeler iade edilebilir.',
          );
        }

        const refundedAt = new Date();
        const claimed = await tx.salePayment.updateMany({
          where: {
            id: existing.id,
            saleId,
            tenantId,
            branchId,
            status: 'COMPLETED',
          },
          data: {
            status: 'REFUNDED',
            refundedAt,
            refundReason: reason,
          },
        });

        if (claimed.count !== 1) {
          throw new ConflictException(
            'Satış ödemesi artık iade edilebilir durumda değil.',
          );
        }

        await this.accountingService.recordSalePaymentRefund(
          tx,
          existing.id,
          existing.method,
          {
            tenantId,
            branchId,
            entryDate: refundedAt,
            amount: Number(existing.amount),
          },
        );

        const actorId = await this.currentUserId(tx);
        const companyId = this.tenantContext.getCompanyId();
        const saleFinanceRow = await tx.sale.findUnique({
          where: { id: saleId },
          select: {
            total: true,
            confirmedAt: true,
            customer: { select: { firstName: true, lastName: true } },
          },
        });
        if (saleFinanceRow) {
          await this.commerceFinanceSync.syncSalePaymentRefund(tx, {
            tenantId,
            companyId,
            branchId,
            saleId,
            actorId,
            customerName:
              `${saleFinanceRow.customer.firstName} ${saleFinanceRow.customer.lastName}`.trim(),
            amount: Number(existing.amount),
            occurredAt: refundedAt,
            paymentId: existing.id,
            method: existing.method,
            reference: existing.reference,
            note: existing.note,
            reason,
          });
        }

        const saleRow = await tx.sale.findUnique({
          where: { id: saleId },
          select: { customerId: true },
        });
        if (saleRow) {
          await this.recordCrmSaleEvent(tx, {
            customerId: saleRow.customerId,
            branchId,
            saleId,
            paymentId: existing.id,
            eventType: 'SALE_PAYMENT_REFUNDED',
            metadata: {
              amount: Number(existing.amount),
              method: existing.method,
              reason,
              refundedAt: refundedAt.toISOString(),
            },
          });
        }

        return tx.salePayment.findUniqueOrThrow({ where: { id: existing.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return {
      payment,
      summary: await this.paymentSummary(saleId, tenantId, branchId),
    };
  }

  async confirm(id: string) {
    const sale = await this.findOne(id);
    if (sale.status !== 'DRAFT') {
      throw new BadRequestException('Yalnızca taslak satışlar onaylanabilir.');
    }

    const packageItems = sale.items.filter(
      (item) => item.type === 'PACKAGE' && item.packageId,
    );

    return this.prisma.$transaction(
      async (tx) => {
        const confirmedAt = new Date();
        const claimed = await tx.sale.updateMany({
          where: {
            id: sale.id,
            tenantId: sale.tenantId,
            branchId: sale.branchId,
            status: 'DRAFT',
          },
          data: { status: 'CONFIRMED', confirmedAt },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Satış artık onaylanabilir durumda değil.',
          );
        }

        for (const line of packageItems) {
          const definition = await tx.servicePackage.findFirst({
            where: {
              id: line.packageId!,
              tenantId: sale.tenantId,
              branchId: sale.branchId,
              active: true,
            },
            include: { items: true },
          });
          if (!definition) {
            throw new BadRequestException(
              'Satıştaki paketlerden biri artık kullanılamıyor.',
            );
          }

          for (
            let packageIndex = 0;
            packageIndex < line.quantity;
            packageIndex += 1
          ) {
            const purchasedAt = new Date();
            const expiresAt = definition.validityDays
              ? new Date(
                  purchasedAt.getTime() +
                    definition.validityDays * 24 * 60 * 60 * 1000,
                )
              : null;

            const customerPackage = await tx.customerPackage.create({
              data: {
                tenantId: sale.tenantId,
                branchId: sale.branchId,
                customerId: sale.customerId,
                packageId: definition.id,
                saleId: sale.id,
                purchasedAt,
                expiresAt,
              },
            });

            const sessions = definition.items.flatMap((item) =>
              Array.from({ length: item.quantity }, () => ({
                tenantId: sale.tenantId,
                branchId: sale.branchId,
                customerPackageId: customerPackage.id,
                serviceId: item.serviceId,
              })),
            );

            if (sessions.length > 0) {
              await tx.session.createMany({ data: sessions });
            }
          }
        }

        await this.accountingService.recordSaleConfirmed(tx, sale.id, {
          tenantId: sale.tenantId,
          branchId: sale.branchId,
          entryDate: confirmedAt,
          amount: Number(sale.total),
        });

        const actorId = await this.currentUserId(tx);
        await this.commerceFinanceSync.syncSaleConfirmed(tx, {
          tenantId: sale.tenantId,
          companyId: this.tenantContext.getCompanyId(),
          branchId: sale.branchId,
          saleId: sale.id,
          actorId,
          customerName:
            `${sale.customer.firstName} ${sale.customer.lastName}`.trim(),
          amount: Number(sale.total),
          occurredAt: confirmedAt,
        });

        await this.recordCrmSaleEvent(tx, {
          customerId: sale.customerId,
          branchId: sale.branchId,
          saleId: sale.id,
          eventType: 'SALE_CONFIRMED',
          metadata: {
            total: Number(sale.total),
            confirmedAt: confirmedAt.toISOString(),
          },
        });

        return tx.sale.findUnique({
          where: { id: sale.id },
          include: {
            items: true,
            payments: true,
            installmentPlan: {
              include: { installments: { orderBy: { sequence: 'asc' } } },
            },
            customerPackages: { include: { package: true, sessions: true } },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async cancel(id: string) {
    const sale = await this.findOne(id);
    if (sale.status !== 'DRAFT') {
      throw new BadRequestException(
        'Yalnızca taslak satışlar iptal edilebilir.',
      );
    }

    const cancelledAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.sale.updateMany({
        where: {
          id: sale.id,
          tenantId: sale.tenantId,
          branchId: sale.branchId,
          status: 'DRAFT',
        },
        data: { status: 'CANCELLED', cancelledAt },
      });

      if (claimed.count !== 1) {
        throw new ConflictException(
          'Satış artık iptal edilebilir durumda değil.',
        );
      }

      const cancelledSale = await tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
      });

      await this.recordCrmSaleEvent(tx, {
        customerId: sale.customerId,
        branchId: sale.branchId,
        saleId: sale.id,
        eventType: 'SALE_CANCELLED',
        metadata: {
          cancelledAt: cancelledAt.toISOString(),
        },
      });

      return cancelledSale;
    });
  }
}
