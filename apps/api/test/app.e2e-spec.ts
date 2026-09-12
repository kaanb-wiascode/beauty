import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(60_000);

describe('Core Business Flow (e2e)', () => {
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

  it('runs customer → staff → service → appointment → payment → refund with branch isolation', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `e2e-${suffix}@example.test`;
    const password = 'E2eStrongPassword!2026';
    const tenantSlug = `e2e-${suffix}`;

    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'E2E',
        lastName: 'Owner',
        tenantName: `E2E ${suffix}`,
        tenantSlug,
      })
      .expect(201);

    const branchAId = register.body.branch.id as string;
    const companyId = register.body.company.id as string;
    const membershipId = register.body.membership.id as string;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const centralToken = login.body.accessToken as string;
    expect(login.body.branch).toBeNull();

    await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ firstName: 'Şubesiz', lastName: 'Kayıt' })
      .expect(400);

    const branchAContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId: branchAId })
      .expect(201);

    const branchAToken = branchAContext.body.accessToken as string;

    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({
        firstName: 'Ayşe',
        lastName: 'E2E',
        phone: `+90555${suffix.slice(0, 7)}`,
        customerSource: 'WALK_IN',
      })
      .expect(201);

    const staff = await request(app.getHttpServer())
      .post('/staff')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({
        firstName: 'Deniz',
        lastName: 'E2E',
        email: `staff-${suffix}@example.test`,
      })
      .expect(201);

    const service = await request(app.getHttpServer())
      .post('/services')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({
        name: `E2E Cilt Bakımı ${suffix}`,
        durationMinutes: 60,
        price: 350,
      })
      .expect(201);

    const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    startAt.setUTCMinutes(0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    const appointment = await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({
        customerId: customer.body.id,
        staffId: staff.body.id,
        serviceId: service.body.id,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      })
      .expect(201);

    const payment = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({
        appointmentId: appointment.body.id,
        amount: 350,
        method: 'CARD',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({
        appointmentId: appointment.body.id,
        amount: 350,
        method: 'CARD',
      })
      .expect(409);

    const refunded = await request(app.getHttpServer())
      .post(`/payments/${payment.body.id}/refund`)
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({ reason: 'E2E İade Testi' })
      .expect(201);

    expect(refunded.body.status).toBe('REFUNDED');

    await request(app.getHttpServer())
      .post(`/payments/${payment.body.id}/refund`)
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({ reason: 'İkinci İade Engellenmeli' })
      .expect(409);

    const overlapStart = new Date(startAt.getTime() + 3 * 60 * 60 * 1000);
    const overlapEnd = new Date(overlapStart.getTime() + 60 * 60 * 1000);
    const concurrentPayload = {
      customerId: customer.body.id,
      staffId: staff.body.id,
      serviceId: service.body.id,
      startAt: overlapStart.toISOString(),
      endAt: overlapEnd.toISOString(),
    };

    const concurrentResults = await Promise.all([
      request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${branchAToken}`)
        .send(concurrentPayload),
      request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${branchAToken}`)
        .send(concurrentPayload),
    ]);

    expect(concurrentResults.map((result) => result.status).sort()).toEqual([
      201,
      409,
    ]);

    const branchB = await prisma.branch.create({
      data: {
        companyId,
        name: `E2E İkinci Şube ${suffix}`,
        code: `E2E-${suffix.slice(0, 8).toUpperCase()}`,
      },
      select: { id: true },
    });

    const branchBContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId: branchB.id })
      .expect(201);

    const branchBToken = branchBContext.body.accessToken as string;

    await request(app.getHttpServer())
      .get(`/customers/${customer.body.id}`)
      .set('Authorization', `Bearer ${branchBToken}`)
      .expect(404);

    const customerB = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${branchBToken}`)
      .send({ firstName: 'B Şubesi', lastName: 'Müşteri' })
      .expect(201);

    const allBranchesContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId: null })
      .expect(201);

    const allBranchesToken = allBranchesContext.body.accessToken as string;
    const customers = await request(app.getHttpServer())
      .get('/customers?limit=100')
      .set('Authorization', `Bearer ${allBranchesToken}`)
      .expect(200);

    const customerIds = customers.body.data.map((row: { id: string }) => row.id);
    expect(customerIds).toEqual(
      expect.arrayContaining([customer.body.id, customerB.body.id]),
    );
  });
});
