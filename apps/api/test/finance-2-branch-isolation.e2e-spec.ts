import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(120_000);

describe('Finance 2.0 branch isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string | null = null;
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const password = 'FinanceBranchIsolation!2026';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new PrismaExceptionFilter(), new ZodExceptionFilter());
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    try {
      if (tenantId) {
        await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
      }
    } finally {
      await app.close();
    }
  });

  it('keeps finance records isolated between active branches of the same company', async () => {
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `finance-branch-${suffix}@example.test`,
        password,
        firstName: 'Finance',
        lastName: 'Branch',
        tenantName: `Finance Branch ${suffix}`,
        tenantSlug: `finance-branch-${suffix}`,
      })
      .expect(201);

    tenantId = String(registered.body.tenant.id);
    const companyId = String(registered.body.company.id);
    const branchA = String(registered.body.branch.id);
    const membershipId = String(registered.body.membership.id);

    const branchB = await prisma.branch.create({
      data: {
        companyId,
        name: `Branch B ${suffix}`,
        code: `B-${suffix}`.slice(0, 30),
      },
      select: { id: true },
    });
    await prisma.membershipBranchAccess.create({
      data: { membershipId, branchId: branchB.id },
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `finance-branch-${suffix}@example.test`, password })
      .expect(201);

    const switchTo = async (branchId: string) =>
      request(app.getHttpServer())
        .post('/auth/context/switch')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ membershipId, branchId })
        .expect(201);

    const branchAToken = `Bearer ${(await switchTo(branchA)).body.accessToken}`;
    const branchBToken = `Bearer ${(await switchTo(branchB.id)).body.accessToken}`;

    await request(app.getHttpServer())
      .post('/finance/setup/bootstrap-default-taxonomy')
      .set('Authorization', branchAToken)
      .expect(201);

    const categories = await request(app.getHttpServer())
      .get('/finance/setup/income-categories')
      .set('Authorization', branchAToken)
      .expect(200);
    const category = categories.body.find((item: { id: string; active: boolean }) => item.active);
    expect(category?.id).toBeTruthy();

    const income = await request(app.getHttpServer())
      .post('/finance/income')
      .set('Authorization', branchAToken)
      .send({
        categoryId: category.id,
        transactionDate: new Date().toISOString(),
        grossAmount: 250,
        netAmount: 250,
        taxAmount: 0,
        currency: 'TRY',
        exchangeRate: 1,
        description: `Branch A only ${suffix}`,
      })
      .expect(201);

    const branchAList = await request(app.getHttpServer())
      .get('/finance/income?page=1&limit=50')
      .set('Authorization', branchAToken)
      .expect(200);
    expect(branchAList.body.data.some((item: { id: string }) => item.id === income.body.id)).toBe(true);

    const branchBList = await request(app.getHttpServer())
      .get('/finance/income?page=1&limit=50')
      .set('Authorization', branchBToken)
      .expect(200);
    expect(branchBList.body.data.some((item: { id: string }) => item.id === income.body.id)).toBe(false);

    const hidden = await request(app.getHttpServer())
      .get(`/finance/income/${income.body.id}`)
      .set('Authorization', branchBToken);
    expect([403, 404]).toContain(hidden.status);
  });
});
