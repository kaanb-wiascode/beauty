import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

type InvoiceDirectionFilter = 'SALES' | 'PURCHASE';
type InvoiceStatusFilter = 'DRAFT' | 'ISSUED' | 'CANCELLED';

@Injectable()
export class InvoicesService {
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

  private async baseCurrency(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
  ) {
    const rows = await client.$queryRawUnsafe<Array<{ baseCurrency: string }>>(
      `SELECT "baseCurrency" AS "baseCurrency"
       FROM companies
       WHERE id=$1::text
       LIMIT 1`,
      companyId,
    );
    return rows[0]?.baseCurrency || 'TRY';
  }

  private distributeDiscount(
    items: Array<{ lineTotal: Prisma.Decimal }>,
    discountTotal: number,
    subtotal: number,
  ) {
    if (discountTotal <= 0 || subtotal <= 0) {
      return items.map(() => 0);
    }

    let allocated = 0;
    return items.map((item, index) => {
      if (index === items.length - 1) {
        return Math.max(
          0,
          Math.round((discountTotal - allocated + Number.EPSILON) * 100) / 100,
        );
      }
      const amount =
        Math.round(
          ((Number(item.lineTotal) / subtotal) * discountTotal +
            Number.EPSILON) *
            100,
        ) / 100;
      allocated =
        Math.round((allocated + amount + Number.EPSILON) * 100) / 100;
      return amount;
    });
  }

  async list(input: {
    direction?: InvoiceDirectionFilter;
    status?: InvoiceStatusFilter;
  }) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.invoice.findMany({
      where: {
        tenantId,
        companyId,
        ...(branchId ? { branchId } : {}),
        ...(input.direction ? { direction: input.direction } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      include: {
        lines: {
          orderBy: { lineNo: 'asc' },
        },
      },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async detail(id: string) {
    const { tenantId, companyId, branchId } = this.context();
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id,
        tenantId,
        companyId,
        ...(branchId ? { branchId } : {}),
      },
      include: {
        lines: {
          orderBy: { lineNo: 'asc' },
        },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Fatura bulunamadı.');
    }
    return invoice;
  }

  async createDraftFromSale(saleId: string) {
    const { tenantId, companyId, branchId } = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.invoice.findFirst({
          where: {
            tenantId,
            companyId,
            saleId,
            status: { not: 'CANCELLED' },
          },
          include: { lines: { orderBy: { lineNo: 'asc' } } },
        });
        if (existing) return existing;

        const sale = await tx.sale.findFirst({
          where: {
            id: saleId,
            tenantId,
            status: 'CONFIRMED',
            ...(branchId ? { branchId } : {}),
            branch: { companyId },
          },
          include: {
            items: {
              orderBy: { createdAt: 'asc' },
            },
            installmentPlan: {
              select: { firstDueAt: true },
            },
          },
        });
        if (!sale) {
          throw new NotFoundException(
            'Onaylanmış satış bulunamadı veya aktif kapsamın dışında.',
          );
        }
        if (!sale.counterpartyId) {
          throw new BadRequestException(
            'Satışın cari hesap bağlantısı bulunamadı.',
          );
        }
        if (!sale.items.length) {
          throw new BadRequestException(
            'Fatura oluşturmak için satışta en az bir kalem olmalıdır.',
          );
        }

        const counterparties = await tx.$queryRawUnsafe<
          Array<{ name: string; taxNumber: string | null }>
        >(
          `SELECT display_name AS name,tax_number AS "taxNumber"
           FROM counterparties
           WHERE id=$1::text AND company_id=$2::text
             AND kind='CUSTOMER' AND status='ACTIVE'
           LIMIT 1`,
          sale.counterpartyId,
          companyId,
        );
        const counterparty = counterparties[0];
        if (!counterparty) {
          throw new BadRequestException(
            'Satışın cari hesap bilgisi bulunamadı.',
          );
        }

        const subtotal = Number(sale.subtotal);
        const discountTotal = Number(sale.discountTotal);
        const discounts = this.distributeDiscount(
          sale.items,
          discountTotal,
          subtotal,
        );
        const currency = await this.baseCurrency(tx, companyId);

        return tx.invoice.create({
          data: {
            tenantId,
            companyId,
            branchId: sale.branchId,
            counterpartyId: sale.counterpartyId,
            direction: 'SALES',
            sourceType: 'SALE',
            saleId: sale.id,
            currency,
            subtotal: sale.subtotal,
            discountTotal: sale.discountTotal,
            taxTotal: 0,
            total: sale.total,
            counterpartyName: counterparty.name,
            counterpartyTaxNumber: counterparty.taxNumber,
            dueAt: sale.installmentPlan?.firstDueAt ?? null,
            lines: {
              create: sale.items.map((item, index) => ({
                lineNo: index + 1,
                kind:
                  item.type === 'SERVICE'
                    ? 'SERVICE'
                    : item.type === 'PACKAGE'
                      ? 'PACKAGE'
                      : item.type === 'PRODUCT'
                        ? 'PRODUCT'
                        : 'OTHER',
                referenceId:
                  item.serviceId ?? item.packageId ?? item.productId ?? null,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountAmount: discounts[index] ?? 0,
                taxRate: 0,
                taxAmount: 0,
                lineTotal: Math.max(
                  0,
                  Math.round(
                    (Number(item.lineTotal) -
                      (discounts[index] ?? 0) +
                      Number.EPSILON) *
                      100,
                  ) / 100,
                ),
              })),
            },
          },
          include: {
            lines: {
              orderBy: { lineNo: 'asc' },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createDraftFromSupplierBill(supplierBillId: string) {
    const { tenantId, companyId, branchId } = this.context();

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.invoice.findFirst({
          where: {
            tenantId,
            companyId,
            supplierBillId,
            status: { not: 'CANCELLED' },
          },
          include: { lines: { orderBy: { lineNo: 'asc' } } },
        });
        if (existing) return existing;

        const bills = await tx.$queryRawUnsafe<
          Array<{
            id: string;
            branchId: string | null;
            counterpartyId: string;
            description: string;
            amount: Prisma.Decimal;
            dueAt: Date | null;
            invoiceNumber: string | null;
            counterpartyName: string;
            taxNumber: string | null;
            address: string | null;
          }>
        >(
          `SELECT b.id,b.branch_id AS "branchId",
                  b.counterparty_id AS "counterpartyId",
                  b.description,b.amount,b.due_at AS "dueAt",
                  b.invoice_number AS "invoiceNumber",
                  cp.display_name AS "counterpartyName",
                  cp.tax_number AS "taxNumber",
                  s.address
           FROM supplier_bills b
           JOIN counterparties cp ON cp.id=b.counterparty_id
           JOIN inventory_suppliers s ON s.id=b.supplier_id
           WHERE b.id=$1::text
             AND b.tenant_id=$2::text
             AND b.company_id=$3::text
             AND b.status<>'CANCELLED'
             AND ($4::text IS NULL OR b.branch_id=$4::text)
           LIMIT 1`,
          supplierBillId,
          tenantId,
          companyId,
          branchId,
        );
        const bill = bills[0];
        if (!bill) {
          throw new NotFoundException(
            'Aktif tedarikçi borcu bulunamadı veya aktif kapsamın dışında.',
          );
        }

        const currency = await this.baseCurrency(tx, companyId);

        return tx.invoice.create({
          data: {
            tenantId,
            companyId,
            branchId: bill.branchId,
            counterpartyId: bill.counterpartyId,
            direction: 'PURCHASE',
            sourceType: 'SUPPLIER_BILL',
            supplierBillId: bill.id,
            currency,
            subtotal: bill.amount,
            discountTotal: 0,
            taxTotal: 0,
            total: bill.amount,
            counterpartyName: bill.counterpartyName,
            counterpartyTaxNumber: bill.taxNumber,
            counterpartyAddress: bill.address,
            dueAt: bill.dueAt,
            note: bill.invoiceNumber
              ? `Tedarikçi belge no: ${bill.invoiceNumber}`
              : null,
            lines: {
              create: [
                {
                  lineNo: 1,
                  kind: 'EXPENSE',
                  description: bill.description,
                  quantity: 1,
                  unitPrice: bill.amount,
                  discountAmount: 0,
                  taxRate: 0,
                  taxAmount: 0,
                  lineTotal: bill.amount,
                },
              ],
            },
          },
          include: {
            lines: {
              orderBy: { lineNo: 'asc' },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
