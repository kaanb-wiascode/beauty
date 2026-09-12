import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@beauty-erp/database';
import { TenantContext } from '../../common/tenant/tenant-context';

export interface CreateProcurementRfqInput {
  warehouseId: string;
  title: string;
  note?: string;
  responseDeadline?: Date;
  items: Array<{
    inventoryProductId: string;
    catalogVariantId: string;
    quantity: number;
    note?: string;
  }>;
  supplierConnectionIds: string[];
}

@Injectable()
export class ProcurementRfqService {
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

  async list(status?: string) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r.id,r.title,r.note,r.status,r.response_deadline AS "responseDeadline",
              r.published_at AS "publishedAt",r.closed_at AS "closedAt",
              r.awarded_quote_id AS "awardedQuoteId",
              r.converted_purchase_order_id AS "convertedPurchaseOrderId",
              r.created_at AS "createdAt",r.updated_at AS "updatedAt",
              w.id AS "warehouseId",w.name AS "warehouseName",w.branch_id AS "branchId",
              COUNT(DISTINCT ri.id)::int AS "itemCount",
              COUNT(DISTINCT rs.id)::int AS "supplierCount",
              COUNT(DISTINCT sq.id) FILTER (WHERE sq.status='SUBMITTED')::int AS "submittedQuoteCount"
       FROM procurement_rfqs r
       JOIN inventory_warehouses w ON w.id=r.warehouse_id AND w.company_id=r.company_id
       LEFT JOIN procurement_rfq_items ri ON ri.rfq_id=r.id
       LEFT JOIN procurement_rfq_suppliers rs ON rs.rfq_id=r.id
       LEFT JOIN supplier_quotes sq ON sq.rfq_id=r.id
       WHERE r.tenant_id=$1::text
         AND r.company_id=$2::text
         AND ($3::text IS NULL OR w.branch_id=$3::text)
         AND ($4::text IS NULL OR r.status=$4::text)
       GROUP BY r.id,w.id,w.name,w.branch_id
       ORDER BY r.created_at DESC`,
      tenantId,
      companyId,
      branchId,
      status ?? null,
    );
  }

  async get(id: string) {
    return this.getTx(this.prisma, id);
  }

  private async getTx(tx: Prisma.TransactionClient | PrismaService, id: string) {
    const { tenantId, companyId, branchId } = this.context();
    const rows = await tx.$queryRawUnsafe<any[]>(
      `SELECT r.id,r.title,r.note,r.status,r.response_deadline AS "responseDeadline",
              r.published_at AS "publishedAt",r.closed_at AS "closedAt",
              r.awarded_quote_id AS "awardedQuoteId",
              r.converted_purchase_order_id AS "convertedPurchaseOrderId",
              r.created_at AS "createdAt",r.updated_at AS "updatedAt",
              w.id AS "warehouseId",w.name AS "warehouseName",w.branch_id AS "branchId"
       FROM procurement_rfqs r
       JOIN inventory_warehouses w ON w.id=r.warehouse_id AND w.company_id=r.company_id
       WHERE r.id=$1::text
         AND r.tenant_id=$2::text
         AND r.company_id=$3::text
         AND ($4::text IS NULL OR w.branch_id=$4::text)
       LIMIT 1`,
      id,
      tenantId,
      companyId,
      branchId,
    );
    if (!rows.length) throw new NotFoundException('RFQ not found');

    const [items, suppliers, quotes, events] = await Promise.all([
      tx.$queryRawUnsafe<any[]>(
        `SELECT ri.id,ri.inventory_product_id AS "inventoryProductId",
                ip.name AS "inventoryProductName",ip.sku,
                ri.catalog_variant_id AS "catalogVariantId",
                cp.name AS "catalogProductName",cv.name AS "catalogVariantName",
                cv.canonical_sku AS "canonicalSku",ri.quantity,ri.note
         FROM procurement_rfq_items ri
         JOIN inventory_products ip ON ip.id=ri.inventory_product_id
         JOIN catalog_variants cv ON cv.id=ri.catalog_variant_id
         JOIN catalog_products cp ON cp.id=cv.catalog_product_id
         WHERE ri.rfq_id=$1::text ORDER BY cp.name,cv.name`,
        id,
      ),
      tx.$queryRawUnsafe<any[]>(
        `SELECT rs.id,rs.supplier_connection_id AS "supplierConnectionId",
                rs.supplier_organization_id AS "supplierOrganizationId",
                so.display_name AS "supplierName",rs.status,rs.invited_at AS "invitedAt",
                rs.responded_at AS "respondedAt"
         FROM procurement_rfq_suppliers rs
         JOIN supplier_organizations so ON so.id=rs.supplier_organization_id
         WHERE rs.rfq_id=$1::text ORDER BY so.display_name`,
        id,
      ),
      tx.$queryRawUnsafe<any[]>(
        `SELECT sq.id,sq.rfq_supplier_id AS "rfqSupplierId",
                sq.supplier_organization_id AS "supplierOrganizationId",
                so.display_name AS "supplierName",sq.currency,sq.status,sq.note,
                sq.valid_until AS "validUntil",sq.version,sq.submitted_at AS "submittedAt",
                COALESCE(SUM(sqi.unit_price * ri.quantity),0)::numeric AS "quotedTotal",
                MAX(sqi.lead_time_days)::int AS "maxLeadTimeDays"
         FROM supplier_quotes sq
         JOIN supplier_organizations so ON so.id=sq.supplier_organization_id
         LEFT JOIN supplier_quote_items sqi ON sqi.supplier_quote_id=sq.id
         LEFT JOIN procurement_rfq_items ri ON ri.id=sqi.rfq_item_id
         WHERE sq.rfq_id=$1::text
         GROUP BY sq.id,so.display_name
         ORDER BY "quotedTotal" ASC,sq.created_at ASC`,
        id,
      ),
      tx.$queryRawUnsafe<any[]>(
        `SELECT id,event_type AS "eventType",actor_user_id AS "actorUserId",
                metadata,created_at AS "createdAt"
         FROM procurement_rfq_events
         WHERE rfq_id=$1::text ORDER BY created_at ASC`,
        id,
      ),
    ]);

    return { ...rows[0], items, suppliers, quotes, events };
  }

  async create(input: CreateProcurementRfqInput, actorUserId: string) {
    const { tenantId, companyId, branchId } = this.context();
    const title = input.title.trim();
    if (!title) throw new BadRequestException('RFQ title is required.');
    if (!input.items.length) throw new BadRequestException('RFQ must contain at least one item.');
    if (!input.supplierConnectionIds.length) {
      throw new BadRequestException('RFQ must invite at least one supplier.');
    }
    if (new Set(input.items.map((item) => item.inventoryProductId)).size !== input.items.length) {
      throw new BadRequestException('Each inventory product can appear only once in an RFQ.');
    }
    if (new Set(input.supplierConnectionIds).size !== input.supplierConnectionIds.length) {
      throw new BadRequestException('Supplier connections must be unique.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const warehouses = await tx.$queryRawUnsafe<any[]>(
          `SELECT id,branch_id AS "branchId" FROM inventory_warehouses
           WHERE id=$1::text AND tenant_id=$2::text AND company_id=$3::text
             AND status='ACTIVE'
             AND ($4::text IS NULL OR branch_id=$4::text)
           LIMIT 1`,
          input.warehouseId,
          tenantId,
          companyId,
          branchId,
        );
        if (!warehouses.length) throw new NotFoundException('Warehouse not found in active scope');

        for (const item of input.items) {
          if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
            throw new BadRequestException('RFQ item quantity must be greater than zero.');
          }
          const rows = await tx.$queryRawUnsafe<any[]>(
            `SELECT ip.id
             FROM inventory_products ip
             CROSS JOIN catalog_variants cv
             WHERE ip.id=$1::text AND ip.tenant_id=$2::text AND ip.company_id=$3::text
               AND ip.status='ACTIVE'
               AND cv.id=$4::text AND cv.status='ACTIVE'
             LIMIT 1`,
            item.inventoryProductId,
            tenantId,
            companyId,
            item.catalogVariantId,
          );
          if (!rows.length) {
            throw new NotFoundException('RFQ inventory product or canonical variant not found');
          }
        }

        const connections = await tx.$queryRawUnsafe<any[]>(
          `SELECT sc.id,sc.supplier_organization_id AS "supplierOrganizationId"
           FROM supplier_connections sc
           JOIN supplier_organizations so ON so.id=sc.supplier_organization_id
           WHERE sc.id=ANY($1::text[])
             AND sc.tenant_id=$2::text AND sc.company_id=$3::text
             AND sc.status='ACTIVE'
             AND so.status='ACTIVE' AND so.verification_status='VERIFIED'`,
          input.supplierConnectionIds,
          tenantId,
          companyId,
        );
        if (connections.length !== input.supplierConnectionIds.length) {
          throw new BadRequestException('Every invited supplier must have an active verified supplier connection.');
        }

        const rfqs = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO procurement_rfqs(
             tenant_id,company_id,warehouse_id,title,note,response_deadline,created_by_user_id
           ) VALUES($1::text,$2::text,$3::text,$4,$5,$6,$7::text)
           RETURNING id`,
          tenantId,
          companyId,
          input.warehouseId,
          title,
          input.note?.trim() || null,
          input.responseDeadline ?? null,
          actorUserId,
        );
        const rfqId = rfqs[0].id as string;

        for (const item of input.items) {
          await tx.$executeRawUnsafe(
            `INSERT INTO procurement_rfq_items(
               rfq_id,inventory_product_id,catalog_variant_id,quantity,note
             ) VALUES($1::text,$2::text,$3::text,$4,$5)`,
            rfqId,
            item.inventoryProductId,
            item.catalogVariantId,
            item.quantity,
            item.note?.trim() || null,
          );
        }

        for (const connection of connections) {
          await tx.$executeRawUnsafe(
            `INSERT INTO procurement_rfq_suppliers(
               rfq_id,supplier_connection_id,supplier_organization_id
             ) VALUES($1::text,$2::text,$3::text)`,
            rfqId,
            connection.id,
            connection.supplierOrganizationId,
          );
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO procurement_rfq_events(rfq_id,tenant_id,company_id,actor_user_id,event_type,metadata)
           VALUES($1::text,$2::text,$3::text,$4::text,'CREATED',$5::jsonb)`,
          rfqId,
          tenantId,
          companyId,
          actorUserId,
          JSON.stringify({
            warehouseId: input.warehouseId,
            itemCount: input.items.length,
            supplierCount: connections.length,
          }),
        );

        return this.getTx(tx, rfqId);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async publish(id: string, actorUserId: string) {
    return this.transition(id, actorUserId, 'DRAFT', 'PUBLISHED', 'PUBLISHED');
  }

  async close(id: string, actorUserId: string) {
    return this.transition(id, actorUserId, 'PUBLISHED', 'CLOSED', 'CLOSED');
  }

  async cancel(id: string, actorUserId: string) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT r.id,r.status
           FROM procurement_rfqs r
           JOIN inventory_warehouses w ON w.id=r.warehouse_id AND w.company_id=r.company_id
           WHERE r.id=$1::text AND r.tenant_id=$2::text AND r.company_id=$3::text
             AND ($4::text IS NULL OR w.branch_id=$4::text)
           FOR UPDATE OF r`,
          id,
          tenantId,
          companyId,
          branchId,
        );
        if (!rows.length) throw new NotFoundException('RFQ not found');
        if (!['DRAFT', 'PUBLISHED', 'CLOSED'].includes(rows[0].status)) {
          throw new BadRequestException(`RFQ cannot be cancelled from status ${rows[0].status}.`);
        }
        await tx.$executeRawUnsafe(
          `UPDATE procurement_rfqs SET status='CANCELLED',closed_at=COALESCE(closed_at,NOW()),updated_at=NOW()
           WHERE id=$1::text`,
          id,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO procurement_rfq_events(rfq_id,tenant_id,company_id,actor_user_id,event_type)
           VALUES($1::text,$2::text,$3::text,$4::text,'CANCELLED')`,
          id,
          tenantId,
          companyId,
          actorUserId,
        );
        return this.getTx(tx, id);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async transition(
    id: string,
    actorUserId: string,
    fromStatus: string,
    toStatus: string,
    eventType: string,
  ) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT r.id,r.status,r.response_deadline AS "responseDeadline"
           FROM procurement_rfqs r
           JOIN inventory_warehouses w ON w.id=r.warehouse_id AND w.company_id=r.company_id
           WHERE r.id=$1::text AND r.tenant_id=$2::text AND r.company_id=$3::text
             AND ($4::text IS NULL OR w.branch_id=$4::text)
           FOR UPDATE OF r`,
          id,
          tenantId,
          companyId,
          branchId,
        );
        if (!rows.length) throw new NotFoundException('RFQ not found');
        if (rows[0].status !== fromStatus) {
          throw new BadRequestException(`RFQ cannot transition from status ${rows[0].status}.`);
        }
        if (toStatus === 'PUBLISHED' && rows[0].responseDeadline) {
          const deadline = new Date(rows[0].responseDeadline);
          if (deadline.getTime() <= Date.now()) {
            throw new BadRequestException('RFQ response deadline must be in the future when published.');
          }
        }
        const timestampColumn = toStatus === 'PUBLISHED' ? 'published_at' : 'closed_at';
        await tx.$executeRawUnsafe(
          `UPDATE procurement_rfqs SET status=$2,${timestampColumn}=NOW(),updated_at=NOW() WHERE id=$1::text`,
          id,
          toStatus,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO procurement_rfq_events(rfq_id,tenant_id,company_id,actor_user_id,event_type)
           VALUES($1::text,$2::text,$3::text,$4::text,$5)`,
          id,
          tenantId,
          companyId,
          actorUserId,
          eventType,
        );
        return this.getTx(tx, id);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async award(id: string, quoteId: string, actorUserId: string) {
    const { tenantId, companyId, branchId } = this.context();
    return this.prisma.$transaction(
      async (tx) => {
        const rfqs = await tx.$queryRawUnsafe<any[]>(
          `SELECT r.id,r.status,r.warehouse_id AS "warehouseId",
                  r.awarded_quote_id AS "awardedQuoteId",
                  r.converted_purchase_order_id AS "purchaseOrderId"
           FROM procurement_rfqs r
           JOIN inventory_warehouses w ON w.id=r.warehouse_id AND w.company_id=r.company_id
           WHERE r.id=$1::text AND r.tenant_id=$2::text AND r.company_id=$3::text
             AND ($4::text IS NULL OR w.branch_id=$4::text)
           FOR UPDATE OF r`,
          id,
          tenantId,
          companyId,
          branchId,
        );
        if (!rfqs.length) throw new NotFoundException('RFQ not found');
        const rfq = rfqs[0];
        if (rfq.status === 'AWARDED') {
          if (rfq.awardedQuoteId === quoteId && rfq.purchaseOrderId) {
            return {
              rfqId: id,
              quoteId,
              purchaseOrderId: rfq.purchaseOrderId,
              status: 'AWARDED',
              idempotent: true,
            };
          }
          throw new BadRequestException('RFQ has already been awarded.');
        }
        if (!['PUBLISHED', 'CLOSED'].includes(rfq.status)) {
          throw new BadRequestException('Only published or closed RFQs can be awarded.');
        }

        const quotes = await tx.$queryRawUnsafe<any[]>(
          `SELECT sq.id,sq.status,sq.currency,sq.valid_until AS "validUntil",sq.version,
                  rs.supplier_connection_id AS "supplierConnectionId",
                  sc.inventory_supplier_id AS "inventorySupplierId",
                  sq.supplier_organization_id AS "supplierOrganizationId"
           FROM supplier_quotes sq
           JOIN procurement_rfq_suppliers rs ON rs.id=sq.rfq_supplier_id AND rs.rfq_id=sq.rfq_id
           JOIN supplier_connections sc ON sc.id=rs.supplier_connection_id AND sc.status='ACTIVE'
           WHERE sq.id=$1::text AND sq.rfq_id=$2::text
           FOR UPDATE OF sq`,
          quoteId,
          id,
        );
        if (!quotes.length) throw new NotFoundException('Supplier quote not found for RFQ');
        const quote = quotes[0];
        if (quote.status !== 'SUBMITTED') {
          throw new BadRequestException('Only submitted supplier quotes can be awarded.');
        }
        if (quote.validUntil && new Date(quote.validUntil).getTime() < Date.now()) {
          throw new BadRequestException('Supplier quote has expired.');
        }

        const quoteItems = await tx.$queryRawUnsafe<any[]>(
          `SELECT ri.id AS "rfqItemId",ri.inventory_product_id AS "inventoryProductId",
                  ri.quantity,ROUND(sqi.unit_price,2) AS "unitCost"
           FROM procurement_rfq_items ri
           LEFT JOIN supplier_quote_items sqi
             ON sqi.rfq_item_id=ri.id AND sqi.supplier_quote_id=$2::text
           WHERE ri.rfq_id=$1::text
           ORDER BY ri.id`,
          id,
          quoteId,
        );
        if (!quoteItems.length || quoteItems.some((item) => item.unitCost === null)) {
          throw new BadRequestException('Supplier quote must price every RFQ item before award.');
        }

        const total = quoteItems.reduce(
          (sum, item) =>
            sum + Number(item.quantity) * Number(item.unitCost),
          0,
        );
        const roundedTotal = Math.round((total + Number.EPSILON) * 100) / 100;

        const orders = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO inventory_purchase_orders(
             tenant_id,company_id,supplier_id,warehouse_id,status,total_amount,note
           ) VALUES($1::text,$2::text,$3::text,$4::text,'DRAFT',$5,$6)
           RETURNING id,status,total_amount AS "totalAmount"`,
          tenantId,
          companyId,
          quote.inventorySupplierId,
          rfq.warehouseId,
          roundedTotal,
          `RFQ ${id} / SupplierQuote ${quoteId}`,
        );
        const purchaseOrder = orders[0];

        for (const item of quoteItems) {
          await tx.$executeRawUnsafe(
            `INSERT INTO inventory_purchase_order_items(
               purchase_order_id,product_id,quantity,unit_cost
             ) VALUES($1::text,$2::text,$3,$4)`,
            purchaseOrder.id,
            item.inventoryProductId,
            Number(item.quantity),
            Number(item.unitCost),
          );
        }

        await tx.$executeRawUnsafe(
          `UPDATE supplier_quotes
           SET status='ACCEPTED',version=version+1,updated_at=NOW()
           WHERE id=$1::text AND status='SUBMITTED'`,
          quoteId,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO supplier_quote_events(
             supplier_quote_id,supplier_organization_id,event_type,from_status,to_status,from_version,to_version,metadata
           ) VALUES($1::text,$2::text,'ACCEPTED','SUBMITTED','ACCEPTED',$3,$3+1,$4::jsonb)`,
          quoteId,
          quote.supplierOrganizationId,
          Number(quote.version),
          JSON.stringify({ purchaseOrderId: purchaseOrder.id, rfqId: id }),
        );

        const rejected = await tx.$queryRawUnsafe<any[]>(
          `UPDATE supplier_quotes
           SET status='REJECTED',version=version+1,updated_at=NOW()
           WHERE rfq_id=$1::text AND id<>$2::text AND status='SUBMITTED'
           RETURNING id,supplier_organization_id AS "supplierOrganizationId",version-1 AS "fromVersion",version AS "toVersion"`,
          id,
          quoteId,
        );
        for (const row of rejected) {
          await tx.$executeRawUnsafe(
            `INSERT INTO supplier_quote_events(
               supplier_quote_id,supplier_organization_id,event_type,from_status,to_status,from_version,to_version,metadata
             ) VALUES($1::text,$2::text,'REJECTED','SUBMITTED','REJECTED',$3,$4,$5::jsonb)`,
            row.id,
            row.supplierOrganizationId,
            Number(row.fromVersion),
            Number(row.toVersion),
            JSON.stringify({ awardedQuoteId: quoteId, rfqId: id }),
          );
        }

        await tx.$executeRawUnsafe(
          `UPDATE procurement_rfqs
           SET status='AWARDED',awarded_quote_id=$2::text,converted_purchase_order_id=$3::text,
               closed_at=COALESCE(closed_at,NOW()),updated_at=NOW()
           WHERE id=$1::text`,
          id,
          quoteId,
          purchaseOrder.id,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO procurement_rfq_events(rfq_id,tenant_id,company_id,actor_user_id,event_type,metadata)
           VALUES
             ($1::text,$2::text,$3::text,$4::text,'AWARDED',$5::jsonb),
             ($1::text,$2::text,$3::text,$4::text,'PURCHASE_ORDER_CREATED',$6::jsonb)`,
          id,
          tenantId,
          companyId,
          actorUserId,
          JSON.stringify({ quoteId }),
          JSON.stringify({ quoteId, purchaseOrderId: purchaseOrder.id, purchaseOrderStatus: 'DRAFT' }),
        );

        return {
          rfqId: id,
          quoteId,
          purchaseOrderId: purchaseOrder.id,
          purchaseOrderStatus: purchaseOrder.status,
          total: Number(purchaseOrder.totalAmount),
          status: 'AWARDED',
          idempotent: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
