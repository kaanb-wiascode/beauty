import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(90_000);

describe('Inventory Overview Branch Scope (e2e)', () => {
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

  it('shows only the active branch warehouse and restores company-wide warehouses for all branches', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `inventory-overview-${suffix}@example.test`;
    const password = 'E2eStrongPassword!2026';

    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'Inventory',
        lastName: 'Owner',
        tenantName: `Inventory Overview ${suffix}`,
        tenantSlug: `inventory-overview-${suffix}`,
      })
      .expect(201);

    const companyId = register.body.company.id as string;
    const branchAId = register.body.branch.id as string;
    const membershipId = register.body.membership.id as string;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const centralToken = login.body.accessToken as string;

    const branchB = await prisma.branch.create({
      data: {
        companyId,
        name: `İkinci Şube ${suffix}`,
        code: `INV-${suffix.slice(0, 8).toUpperCase()}`,
      },
      select: { id: true },
    });

    const branchAContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId: branchAId })
      .expect(201);

    const branchAOverview = await request(app.getHttpServer())
      .get('/inventory/overview')
      .set('Authorization', `Bearer ${branchAContext.body.accessToken as string}`)
      .expect(200);

    expect(branchAOverview.body.warehouses).toHaveLength(1);
    expect(branchAOverview.body.warehouses[0].branchId).toBe(branchAId);

    const branchBContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId: branchB.id })
      .expect(201);

    const branchBOverview = await request(app.getHttpServer())
      .get('/inventory/overview')
      .set('Authorization', `Bearer ${branchBContext.body.accessToken as string}`)
      .expect(200);

    expect(branchBOverview.body.warehouses).toHaveLength(1);
    expect(branchBOverview.body.warehouses[0].branchId).toBe(branchB.id);

    const allBranchesContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId: null })
      .expect(201);

    const allBranchesOverview = await request(app.getHttpServer())
      .get('/inventory/overview')
      .set(
        'Authorization',
        `Bearer ${allBranchesContext.body.accessToken as string}`,
      )
      .expect(200);

    const branchIds = allBranchesOverview.body.warehouses.map(
      (warehouse: { branchId: string | null }) => warehouse.branchId,
    );

    expect(branchIds).toEqual(expect.arrayContaining([branchAId, branchB.id]));
    expect(branchIds).toContain(null);
  });
});
