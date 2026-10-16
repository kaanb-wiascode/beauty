import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(90_000);

describe('Procurement Lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(
      new PrismaExceptionFilter(),
      new ZodExceptionFilter(),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('converts an approved purchase request and receives it into stock, AP and accounting', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `procurement-${suffix}@example.test`;
    const password = 'E2eStrongPassword!2026';

    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'Procurement',
        lastName: 'E2E',
        tenantName: `Procurement E2E ${suffix}`,
        tenantSlug: `procurement-e2e-${suffix}`,
      })
      .expect(201);

    const branchId = register.body.branch.id as string;
    const membershipId = register.body.membership.id as string;
    const companyId = register.body.company.id as string;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { tenantId: true },
    });
    expect(company).not.toBeNull();
    const tenantId = company!.tenantId;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const branchContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .send({ membershipId, branchId })
      .expect(201);

    const branchToken = branchContext.body.accessToken as string;

    const overview = await request(app.getHttpServer())
      .get('/inventory/overview')
      .set('Authorization', `Bearer ${branchToken}`)
      .expect(200);

    const warehouse = overview.body.warehouses.find(
      (row: { branchId: string | null }) => row.branchId === branchId,
    );
    expect(warehouse).toBeDefined();

    const product = await request(app.getHttpServer())
      .post('/inventory/products')
      .set('Authorization', `Bearer ${branchToken}`)
      .send({
        name: `E2E Procurement Product ${suffix}`,
        unit: 'UNIT',
        warehouseId: warehouse.id,
        initialQuantity: 1,
        minimumQuantity: 1,
        targetQuantity: 5,
        purchasePrice: 20,
      })
      .expect(201);

    const supplierId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO inventory_suppliers(id,tenant_id,company_id,name,status)
       VALUES($1::text,$2::text,$3::text,$4,'ACTIVE')`,
      supplierId,
      tenantId,
      companyId,
      `E2E Supplier ${suffix}`,
    );

    const purchaseRequestId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO inventory_purchase_requests(
         id,tenant_id,company_id,warehouse_id,product_id,current_quantity,requested_quantity,status,reason
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,1,4,'PENDING',$6)`,
      purchaseRequestId,
      tenantId,
      companyId,
      warehouse.id,
      product.body.id,
      'E2E procurement lifecycle',
    );

    await request(app.getHttpServer())
      .post(`/procurement/purchase-requests/${purchaseRequestId}/approve`)
      .set('Authorization', `Bearer ${branchToken}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('APPROVED');
      });

    const converted = await request(app.getHttpServer())
      .post(`/procurement/purchase-requests/${purchaseRequestId}/convert`)
      .set('Authorization', `Bearer ${branchToken}`)
      .send({ supplierId, unitCost: 50, note: 'E2E converted request' })
      .expect(201);

    expect(converted.body.purchaseRequestStatus).toBe('ORDERED');
    expect(converted.body.purchaseOrderStatus).toBe('APPROVED');
    expect(Number(converted.body.total)).toBe(200);

    const purchaseOrderId = converted.body.purchaseOrderId as string;

    const detailBeforeApproval = await request(app.getHttpServer())
      .get(`/procurement/purchase-orders/${purchaseOrderId}`)
      .set('Authorization', `Bearer ${branchToken}`)
      .expect(200);

    expect(detailBeforeApproval.body.order.status).toBe('APPROVED');
    expect(detailBeforeApproval.body.items).toHaveLength(1);
    expect(Number(detailBeforeApproval.body.items[0].quantity)).toBe(4);
    expect(Number(detailBeforeApproval.body.items[0].unitCost)).toBe(50);

    const purchaseOrderItemId = detailBeforeApproval.body.items[0].id as string;

    const submittedApproval = await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${purchaseOrderId}/submit-approval`)
      .set('Authorization', `Bearer ${branchToken}`)
      .expect(201);

    expect(submittedApproval.body.order.status).toBe('PENDING');
    expect(submittedApproval.body.approvals).toHaveLength(1);
    expect(submittedApproval.body.approvals[0].requiredRole).toBe('MANAGER');

    const approved = await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${purchaseOrderId}/approvals/1/approve`)
      .set('Authorization', `Bearer ${branchToken}`)
      .expect(201);

    expect(approved.body.order.status).toBe('APPROVED');
    expect(approved.body.approvals[0].status).toBe('APPROVED');

    await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${purchaseOrderId}/order`)
      .set('Authorization', `Bearer ${branchToken}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('ORDERED');
      });

    const received = await request(app.getHttpServer())
      .post(`/procurement/purchase-orders/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${branchToken}`)
      .send({
        items: [{ purchaseOrderItemId, quantity: 4 }],
        invoiceNumber: `INV-${suffix}`,
        note: 'E2E full receipt',
      })
      .expect(201);

    expect(received.body.receiptId).toBeDefined();
    expect(received.body.supplierBillId).toBeDefined();
    expect(received.body.purchaseOrderStatus).toBe('RECEIVED');
    expect(Number(received.body.total)).toBe(200);

    const stockRows = await prisma.$queryRawUnsafe<
      Array<{ quantity: number | string; costPerUnit: number | string }>
    >(
      `SELECT quantity,cost_per_unit AS "costPerUnit"
       FROM inventory_stock
       WHERE product_id=$1::text AND warehouse_id=$2::text
       LIMIT 1`,
      product.body.id,
      warehouse.id,
    );

    expect(Number(stockRows[0]?.quantity)).toBe(5);
    expect(Number(stockRows[0]?.costPerUnit)).toBe(44);

    const requests = await request(app.getHttpServer())
      .get('/procurement/purchase-requests?status=ORDERED')
      .set('Authorization', `Bearer ${branchToken}`)
      .expect(200);

    expect(
      requests.body.some(
        (row: { id: string; convertedPurchaseOrderId: string | null }) =>
          row.id === purchaseRequestId &&
          row.convertedPurchaseOrderId === purchaseOrderId,
      ),
    ).toBe(true);

    const receipts = await request(app.getHttpServer())
      .get(`/procurement/goods-receipts?purchaseOrderId=${purchaseOrderId}`)
      .set('Authorization', `Bearer ${branchToken}`)
      .expect(200);

    expect(receipts.body).toHaveLength(1);
    expect(receipts.body[0].id).toBe(received.body.receiptId);
    expect(receipts.body[0].supplierBillId).toBe(received.body.supplierBillId);

    const bills = await prisma.$queryRawUnsafe<
      Array<{ id: string; amount: number | string; sourceId: string }>
    >(
      `SELECT id,amount,source_id AS "sourceId"
       FROM supplier_bills
       WHERE id=$1::text AND company_id=$2::text AND source_type='GOODS_RECEIPT'
       LIMIT 1`,
      received.body.supplierBillId,
      companyId,
    );

    expect(bills).toHaveLength(1);
    expect(Number(bills[0].amount)).toBe(200);
    expect(bills[0].sourceId).toBe(received.body.receiptId);

    const journals = await prisma.$queryRawUnsafe<
      Array<{ status: string; debit: number | string; credit: number | string }>
    >(
      `SELECT je.status,
              COALESCE(SUM(jel.debit),0)::numeric AS debit,
              COALESCE(SUM(jel.credit),0)::numeric AS credit
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel."journalEntryId"=je.id
       WHERE je."companyId"=$1::text
         AND je."branchId"=$2::text
         AND je."referenceType"='GOODS_RECEIPT'
         AND je."referenceId"=$3::text
       GROUP BY je.id,je.status`,
      companyId,
      branchId,
      received.body.receiptId,
    );

    expect(journals).toHaveLength(1);
    expect(journals[0].status).toBe('POSTED');
    expect(Number(journals[0].debit)).toBe(200);
    expect(Number(journals[0].credit)).toBe(200);
  });
});
