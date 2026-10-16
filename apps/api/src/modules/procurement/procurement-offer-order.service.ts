import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export interface CreateOrderFromSupplierOfferInput {
  warehouseId: string;
  inventoryProductId: string;
  quantity: number;
  expectedOfferVersion: number;
  idempotencyKey: string;
}

@Injectable()
export class ProcurementOfferOrderService {
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

  async createDraftOrder(
    offerId: string,
    input: CreateOrderFromSupplierOfferInput,
    actorUserId: string,
  ) {
    const { tenantId, companyId, branchId } = this.context();
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException(
        'Purchase quantity must be greater than zero.',
      );
    }
    if (
      !Number.isInteger(input.expectedOfferVersion) ||
      input.expectedOfferVersion <= 0
    ) {
      throw new BadRequestException(
        'Expected offer version must be a positive integer.',
      );
    }
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 160) {
      throw new BadRequestException('A valid idempotency key is required.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.$queryRawUnsafe<any[]>(
          `SELECT o.purchase_order_id AS "purchaseOrderId",po.status,po.total_amount AS "totalAmount"
           FROM procurement_purchase_order_origins o
           JOIN inventory_purchase_orders po ON po.id=o.purchase_order_id
           WHERE o.tenant_id=$1::text AND o.company_id=$2::text AND o.idempotency_key=$3
           LIMIT 1`,
          tenantId,
          companyId,
          idempotencyKey,
        );
        if (existing.length) {
          return {
            purchaseOrderId: existing[0].purchaseOrderId,
            purchaseOrderStatus: existing[0].status,
            total: Number(existing[0].totalAmount),
            idempotent: true,
          };
        }

        const warehouses = await tx.$queryRawUnsafe<any[]>(
          `SELECT id FROM inventory_warehouses
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND status='ACTIVE' AND ($4::text IS NULL OR branch_id=$4::text)
           LIMIT 1`,
          input.warehouseId,
          tenantId,
          companyId,
          branchId,
        );
        if (!warehouses.length) {
          throw new NotFoundException(
            'Warehouse not found in active branch scope.',
          );
        }

        const offers = await tx.$queryRawUnsafe<any[]>(
          `SELECT so.id,so.catalog_variant_id AS "catalogVariantId",so.currency,
                  so.unit_price AS "unitPrice",so.minimum_order_quantity AS "minimumOrderQuantity",
                  so.order_multiple AS "orderMultiple",so.available_quantity AS "availableQuantity",
                  so.valid_from AS "validFrom",so.valid_to AS "validTo",so.status,so.version,
                  so.visibility_scope AS "visibilityScope",
                  so.supplier_organization_id AS "supplierOrganizationId",
                  sc.id AS "supplierConnectionId",sc.inventory_supplier_id AS "inventorySupplierId"
           FROM supplier_offers so
           JOIN supplier_organizations org
             ON org.id=so.supplier_organization_id
            AND org.status='ACTIVE' AND org.verification_status='VERIFIED'
           JOIN supplier_connections sc
             ON sc.supplier_organization_id=so.supplier_organization_id
            AND sc.tenant_id=$2::text AND sc.company_id=$3::text AND sc.status='ACTIVE'
           WHERE so.id=$1::text
             AND (
               so.visibility_scope='CONNECTED'
               OR EXISTS (
                 SELECT 1
                 FROM supplier_offer_eligibilities eligibility
                 WHERE eligibility.supplier_offer_id=so.id
                   AND eligibility.supplier_connection_id=sc.id
               )
             )
           FOR UPDATE OF so`,
          offerId,
          tenantId,
          companyId,
        );
        if (!offers.length) {
          throw new NotFoundException(
            'Connected eligible verified supplier offer not found.',
          );
        }
        const offer = offers[0];
        if (offer.status !== 'ACTIVE') {
          throw new BadRequestException(
            'Only active supplier offers can create purchase orders.',
          );
        }
        if (Number(offer.version) !== input.expectedOfferVersion) {
          throw new BadRequestException('Supplier offer changed concurrently.');
        }
        const now = Date.now();
        if (offer.validFrom && new Date(offer.validFrom).getTime() > now) {
          throw new BadRequestException('Supplier offer is not valid yet.');
        }
        if (offer.validTo && new Date(offer.validTo).getTime() <= now) {
          throw new BadRequestException('Supplier offer has expired.');
        }

        const quantity = Number(input.quantity);
        const minimumOrderQuantity = Number(offer.minimumOrderQuantity);
        const orderMultiple = Number(offer.orderMultiple);
        const availableQuantity =
          offer.availableQuantity == null
            ? null
            : Number(offer.availableQuantity);
        if (quantity + 1e-9 < minimumOrderQuantity) {
          throw new BadRequestException(
            'Purchase quantity is below supplier minimum order quantity.',
          );
        }
        const multipleRatio = quantity / orderMultiple;
        if (Math.abs(multipleRatio - Math.round(multipleRatio)) > 1e-9) {
          throw new BadRequestException(
            'Purchase quantity must respect supplier order multiple.',
          );
        }
        if (
          availableQuantity !== null &&
          quantity - availableQuantity > 1e-9
        ) {
          throw new BadRequestException(
            'Purchase quantity exceeds supplier available quantity.',
          );
        }

        const products = await tx.$queryRawUnsafe<any[]>(
          `SELECT ip.id
           FROM inventory_products ip
           JOIN inventory_product_catalog_links l
             ON l.inventory_product_id=ip.id
            AND l.tenant_id=ip.tenant_id
            AND l.company_id=ip.company_id
           WHERE ip.id=$1::text AND ip.tenant_id=$2::text AND ip.company_id=$3::text
             AND ip.status='ACTIVE' AND l.catalog_variant_id=$4::text
           LIMIT 1`,
          input.inventoryProductId,
          tenantId,
          companyId,
          offer.catalogVariantId,
        );
        if (!products.length) {
          throw new BadRequestException(
            'Inventory product is not linked to the supplier offer catalog variant.',
          );
        }

        const unitCost =
          Math.round((Number(offer.unitPrice) + Number.EPSILON) * 100) / 100;
        const total =
          Math.round((unitCost * quantity + Number.EPSILON) * 100) / 100;
        const orders = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO inventory_purchase_orders(
             tenant_id,company_id,supplier_id,warehouse_id,status,total_amount,note
           ) VALUES($1::text,$2::text,$3::text,$4::text,'DRAFT',$5,$6)
           RETURNING id,status,total_amount AS "totalAmount"`,
          tenantId,
          companyId,
          offer.inventorySupplierId,
          input.warehouseId,
          total,
          `SupplierOffer ${offerId}`,
        );
        const purchaseOrder = orders[0];

        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_purchase_order_items(
             purchase_order_id,product_id,quantity,unit_cost
           ) VALUES($1::text,$2::text,$3,$4)`,
          purchaseOrder.id,
          input.inventoryProductId,
          quantity,
          unitCost,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO procurement_purchase_order_origins(
             tenant_id,company_id,purchase_order_id,source_type,supplier_organization_id,
             supplier_connection_id,supplier_offer_id,source_version,currency,idempotency_key,
             commercial_snapshot,created_by_user_id
           ) VALUES($1::text,$2::text,$3::text,'SUPPLIER_OFFER',$4::text,$5::text,$6::text,$7,$8,$9,$10::jsonb,$11::text)`,
          tenantId,
          companyId,
          purchaseOrder.id,
          offer.supplierOrganizationId,
          offer.supplierConnectionId,
          offer.id,
          Number(offer.version),
          offer.currency,
          idempotencyKey,
          JSON.stringify({
            catalogVariantId: offer.catalogVariantId,
            inventoryProductId: input.inventoryProductId,
            quantity,
            sourceUnitPrice: Number(offer.unitPrice),
            purchaseOrderUnitCost: unitCost,
            minimumOrderQuantity,
            orderMultiple,
            availableQuantity,
            visibilityScope: offer.visibilityScope,
            supplierConnectionId: offer.supplierConnectionId,
          }),
          actorUserId,
        );

        return {
          purchaseOrderId: purchaseOrder.id,
          purchaseOrderStatus: purchaseOrder.status,
          total: Number(purchaseOrder.totalAmount),
          idempotent: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
