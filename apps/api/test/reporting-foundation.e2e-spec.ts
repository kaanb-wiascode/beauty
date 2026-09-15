import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(90_000);

describe('Reporting foundation authorization (e2e)', () => {
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

  it('rejects unauthenticated reporting requests', async () => {
    await request(app.getHttpServer())
      .get('/reports/catalog')
      .expect(401);

    await request(app.getHttpServer())
      .post('/reports/preview')
      .send({
        reportKey: 'staff.performance',
        filters: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-30T23:59:59.999Z',
        },
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/reports/exports')
      .send({
        reportKey: 'staff.performance',
        format: 'CSV',
        filters: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-30T23:59:59.999Z',
        },
      })
      .expect(401);
  });

  it('allows an authenticated owner to use catalog, preview and export history', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `reporting-${suffix}@example.test`;
    const password = 'E2eStrongPassword!2026';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'Reporting',
        lastName: 'Owner',
        tenantName: `Reporting ${suffix}`,
        tenantSlug: `reporting-${suffix}`,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const token = login.body.accessToken as string;

    const catalog = await request(app.getHttpServer())
      .get('/reports/catalog')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(catalog.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'staff.performance' }),
        expect.objectContaining({ key: 'service.performance' }),
        expect.objectContaining({ key: 'payments.summary' }),
      ]),
    );

    const preview = await request(app.getHttpServer())
      .post('/reports/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reportKey: 'staff.performance',
        filters: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-30T23:59:59.999Z',
        },
        sort: { key: 'collected', direction: 'desc' },
        page: 1,
        limit: 25,
      })
      .expect(201);

    expect(preview.body).toEqual(
      expect.objectContaining({
        report: {
          key: 'staff.performance',
          resultKind: 'table',
        },
        data: expect.any(Array),
        meta: expect.objectContaining({
          page: 1,
          limit: 25,
        }),
      }),
    );

    const exportJob = await request(app.getHttpServer())
      .post('/reports/exports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reportKey: 'staff.performance',
        format: 'CSV',
        filters: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-30T23:59:59.999Z',
        },
        columns: ['name', 'collected'],
        includeSummary: true,
        includeCharts: false,
      })
      .expect(201);

    expect(exportJob.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        reportKey: 'staff.performance',
        format: 'CSV',
        status: 'QUEUED',
        storageKey: null,
      }),
    );

    const history = await request(app.getHttpServer())
      .get('/reports/exports?status=QUEUED&limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(history.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: exportJob.body.id }),
      ]),
    );

    await request(app.getHttpServer())
      .get(`/reports/exports/${exportJob.body.id as string}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            id: exportJob.body.id,
            status: 'QUEUED',
          }),
        );
      });
  });

  it('rejects arbitrary preview and export fields at the HTTP boundary', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `reporting-invalid-${suffix}@example.test`;
    const password = 'E2eStrongPassword!2026';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'Reporting',
        lastName: 'Invalid',
        tenantName: `Reporting Invalid ${suffix}`,
        tenantSlug: `reporting-invalid-${suffix}`,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    const token = login.body.accessToken as string;

    await request(app.getHttpServer())
      .post('/reports/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reportKey: 'staff.performance',
        filters: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-30T23:59:59.999Z',
        },
        branchId: 'attempted-scope-override',
        prismaSelect: { tenantId: true },
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/reports/exports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reportKey: 'staff.performance',
        format: 'CSV',
        filters: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-30T23:59:59.999Z',
        },
        branchId: 'attempted-scope-override',
        storageKey: '../../unsafe.csv',
      })
      .expect(400);
  });
});
