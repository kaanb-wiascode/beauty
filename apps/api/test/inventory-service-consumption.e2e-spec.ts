import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(90_000);

describe('Inventory Service Consumption (e2e)', () => {
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

  it('consumes service materials and posts inventory accounting when an appointment is completed', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `inventory-consumption-${suffix}@example.test`;
    const password = 'E2eStrongPassword!2026';

    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'Inventory',
        lastName: 'E2E',
        tenantName: `Inventory E2E ${suffix}`,
        tenantSlug: `inventory-e2e-${suffix}`,
      })
      .expect(201);

    const branchId = register.body.branch.id as string;
    const membershipId = register.body.membership.id as string;
    const companyId = register.body.company.id as string;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const centralToken = login.body.accessToken as string;

    const branchContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId })
      .expect(201);

    const branchToken = branchContext.body.accessToken as string;

    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${branchToken}`)
      .send({
        firstName: 'Stok',
        lastName: 'Müşterisi',
        phone: `+90550${suffix.slice(0, 7)}`,
        customerSource: 'WALK_IN',
      })
      .expect(201);

    const staff = await request(app.getHttpServer())
      .post('/staff')
      .set('Authorization', `Bearer ${branchToken}`)
      .send({
        firstName: 'Stok',
        lastName: 'Uzmanı',
        email: `inventory-staff-${suffix}@example.test`,
      })
      .expect(201);

    const service = await request(app.getHttpServer())
      .post('/services')
      .set('Authorization', `Bearer ${branchToken}`)
      .send({
        name: `E2E Tüketimli Hizmet ${suffix}`,
        durationMinutes: 60,
        price: 500,
      })
      .expect(201);

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
        name: `E2E Sarf Malzeme ${suffix}`,
        unit: 'UNIT',
        warehouseId: warehouse.id,
        initialQuantity: 10,
        minimumQuantity: 2,
        targetQuantity: 12,
        purchasePrice: 50,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/inventory/services/${service.body.id}/materials`)
      .set('Authorization', `Bearer ${branchToken}`)
      .send({
        materials: [
          {
            productId: product.body.id,
            quantity: 2,
          },
        ],
      })
      .expect(201);

    const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    startAt.setUTCMinutes(0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    const appointment = await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${branchToken}`)
      .send({
        customerId: customer.body.id,
        staffId: staff.body.id,
        serviceId: service.body.id,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/appointments/${appointment.body.id}`)
      .set('Authorization', `Bearer ${branchToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);

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

    expect(Number(stockRows[0]?.quantity)).toBe(8);
    expect(Number(stockRows[0]?.costPerUnit)).toBe(50);

    const movements = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        type: string;
        quantity: number | string;
        referenceType: string | null;
        referenceId: string | null;
      }>
    >(
      `SELECT id,type,quantity,reference_type AS "referenceType",reference_id AS "referenceId"
       FROM inventory_movements
       WHERE company_id=$1::text
         AND product_id=$2::text
         AND warehouse_id=$3::text
         AND type='SERVICE_CONSUMPTION'
         AND reference_type='APPOINTMENT'
         AND reference_id=$4::text
       ORDER BY created_at DESC
       LIMIT 1`,
      companyId,
      product.body.id,
      warehouse.id,
      appointment.body.id,
    );

    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity)).toBe(2);
    expect(movements[0].referenceType).toBe('APPOINTMENT');
    expect(movements[0].referenceId).toBe(appointment.body.id);

    const journals = await prisma.$queryRawUnsafe<
      Array<{ id: string; status: string; debit: number | string; credit: number | string }>
    >(
      `SELECT je.id,je.status,
              COALESCE(SUM(jel.debit),0)::numeric AS debit,
              COALESCE(SUM(jel.credit),0)::numeric AS credit
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel."journalEntryId"=je.id
       WHERE je."companyId"=$1::text
         AND je."branchId"=$2::text
         AND je."referenceType"='INVENTORY_CONSUMPTION'
         AND je."referenceId"=$3::text
       GROUP BY je.id,je.status`,
      companyId,
      branchId,
      movements[0].id,
    );

    expect(journals).toHaveLength(1);
    expect(journals[0].status).toBe('POSTED');
    expect(Number(journals[0].debit)).toBe(100);
    expect(Number(journals[0].credit)).toBe(100);
  });
});
