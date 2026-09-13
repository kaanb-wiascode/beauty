import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(90_000);

describe('CRM Opportunity -> Sale (e2e)', () => {
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('converts a won opportunity into one draft sale and completes the commercial flow', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `crm-sale-${suffix}@example.test`;
    const password = 'E2eStrongPassword!2026';

    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'CRM',
        lastName: 'Sale E2E',
        tenantName: `CRM Sale ${suffix}`,
        tenantSlug: `crm-sale-${suffix}`,
      })
      .expect(201);

    const membershipId = register.body.membership.id as string;
    const branchId = register.body.branch.id as string;

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

    const token = branchContext.body.accessToken as string;

    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'CRM',
        lastName: 'Customer',
        phone: `+90551${suffix.slice(0, 7)}`,
        customerSource: 'CRM',
      })
      .expect(201);

    const service = await request(app.getHttpServer())
      .post('/services')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `CRM E2E Hizmet ${suffix}`,
        durationMinutes: 45,
        price: 500,
      })
      .expect(201);

    const lead = await request(app.getHttpServer())
      .post('/crm/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'CRM',
        lastName: 'Lead',
        phone: `+90550${suffix.slice(0, 7)}`,
        source: 'MANUAL',
      })
      .expect(201);

    const qualified = await request(app.getHttpServer())
      .post(`/crm/leads/${lead.body.id}/qualify`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        version: lead.body.version,
        title: `CRM E2E Fırsat ${suffix}`,
        estimatedValue: 1000,
        probability: 40,
      })
      .expect(201);

    const needsAnalysis = await request(app.getHttpServer())
      .post(`/crm/opportunities/${qualified.body.id}/transition`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        version: qualified.body.version,
        stage: 'NEEDS_ANALYSIS',
        probability: 55,
      })
      .expect(201);

    const proposal = await request(app.getHttpServer())
      .post(`/crm/opportunities/${qualified.body.id}/transition`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        version: needsAnalysis.body.version,
        stage: 'PROPOSAL',
        probability: 75,
      })
      .expect(201);

    const won = await request(app.getHttpServer())
      .post(`/crm/opportunities/${qualified.body.id}/transition`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        version: proposal.body.version,
        stage: 'WON',
        probability: 100,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/sales/from-opportunity/${qualified.body.id}`)
      .set('Authorization', `Bearer ${centralToken}`)
      .send({
        version: won.body.version,
        customerId: customer.body.id,
        discountTotal: 50,
        items: [{ type: 'SERVICE', referenceId: service.body.id, quantity: 2 }],
      })
      .expect(400);

    const converted = await request(app.getHttpServer())
      .post(`/sales/from-opportunity/${qualified.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        version: won.body.version,
        customerId: customer.body.id,
        discountTotal: 50,
        items: [{ type: 'SERVICE', referenceId: service.body.id, quantity: 2 }],
      })
      .expect(201);

    expect(converted.body.idempotent).toBe(false);
    expect(converted.body.sale.status).toBe('DRAFT');
    expect(Number(converted.body.sale.total)).toBe(950);
    expect(converted.body.sale.items).toHaveLength(1);

    const idempotent = await request(app.getHttpServer())
      .post(`/sales/from-opportunity/${qualified.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        version: won.body.version,
        customerId: customer.body.id,
        discountTotal: 0,
        items: [{ type: 'SERVICE', referenceId: service.body.id, quantity: 1 }],
      })
      .expect(201);

    expect(idempotent.body.idempotent).toBe(true);
    expect(idempotent.body.sale.id).toBe(converted.body.sale.id);
    expect(Number(idempotent.body.sale.total)).toBe(950);

    const confirmed = await request(app.getHttpServer())
      .post(`/sales/${converted.body.sale.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(confirmed.body.status).toBe('CONFIRMED');

    const payment = await request(app.getHttpServer())
      .post(`/sales/${converted.body.sale.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 950, method: 'CARD', reference: `E2E-${suffix}` })
      .expect(201);

    expect(payment.body.summary.paymentStatus).toBe('PAID');
    expect(payment.body.summary.balance).toBe(0);

    const summary = await request(app.getHttpServer())
      .get(`/sales/${converted.body.sale.id}/payment-summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(summary.body.paymentStatus).toBe('PAID');
    expect(summary.body.paid).toBe(950);
    expect(summary.body.balance).toBe(0);
  });
});
