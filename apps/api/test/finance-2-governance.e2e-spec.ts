import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(120_000);

describe('Finance 2.0 governance and FX (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string | null = null;
  let authorization = '';
  let companyId = '';
  let branchId = '';
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const password = 'Finance2Acceptance!2026';

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

    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `finance2-${suffix}@example.test`,
        password,
        firstName: 'Finance',
        lastName: 'Acceptance',
        tenantName: `Finance 2 ${suffix}`,
        tenantSlug: `finance2-${suffix}`,
      })
      .expect(201);

    tenantId = String(registered.body.tenant.id);
    companyId = String(registered.body.company.id);
    branchId = String(registered.body.branch.id);
    const membershipId = String(registered.body.membership.id);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `finance2-${suffix}@example.test`, password })
      .expect(201);

    const switched = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ membershipId, branchId })
      .expect(201);

    authorization = `Bearer ${switched.body.accessToken}`;

    await request(app.getHttpServer())
      .post('/finance/setup/bootstrap-default-taxonomy')
      .set('Authorization', authorization)
      .expect(201);
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

  it('blocks finance writes after a financial period is closed', async () => {
    const period = await request(app.getHttpServer())
      .post('/finance/periods')
      .set('Authorization', authorization)
      .send({
        name: 'Ocak 2198',
        startsAt: '2198-01-01T00:00:00.000Z',
        endsAt: '2198-01-31T23:59:59.999Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/finance/periods/${period.body.id}/close`)
      .set('Authorization', authorization)
      .send({ reason: 'Finance 2.0 acceptance close' })
      .expect(201);

    const categories = await request(app.getHttpServer())
      .get('/finance/setup/expense-categories')
      .set('Authorization', authorization)
      .expect(200);

    const category = categories.body.find(
      (item: { id: string; active: boolean }) => item.active,
    );
    expect(category?.id).toBeTruthy();

    const blocked = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', authorization)
      .send({
        categoryId: category.id,
        transactionDate: '2198-01-15T12:00:00.000Z',
        grossAmount: 1000,
        netAmount: 1000,
        taxAmount: 0,
        withholdingAmount: 0,
        currency: 'TRY',
        exchangeRate: 1,
        description: 'Kapalı dönem kabul testi',
      })
      .expect(400);

    expect(String(blocked.body.message)).toContain('kapalı finansal döneme');
  });

  it('posts foreign-currency income to the base-currency ledger using exchange rate', async () => {
    const categories = await request(app.getHttpServer())
      .get('/finance/setup/income-categories')
      .set('Authorization', authorization)
      .expect(200);
    const category = categories.body.find(
      (item: { id: string; active: boolean }) => item.active,
    );
    expect(category?.id).toBeTruthy();

    const accounts = await request(app.getHttpServer())
      .get('/accounting/accounts')
      .set('Authorization', authorization)
      .expect(200);
    const revenueAccount = accounts.body.find((item: { code: string }) => item.code === '600');
    const receivableAccount = accounts.body.find((item: { code: string }) => item.code === '120');
    const bankAccount = accounts.body.find((item: { code: string }) => item.code === '102');
    expect(revenueAccount?.id).toBeTruthy();
    expect(receivableAccount?.id).toBeTruthy();
    expect(bankAccount?.id).toBeTruthy();

    await request(app.getHttpServer())
      .put('/finance/setup/income-accounting-mappings')
      .set('Authorization', authorization)
      .send({
        categoryId: category.id,
        revenueAccountId: revenueAccount.id,
        receivableAccountId: receivableAccount.id,
      })
      .expect(200);

    const income = await request(app.getHttpServer())
      .post('/finance/income')
      .set('Authorization', authorization)
      .send({
        categoryId: category.id,
        transactionDate: '2198-02-10T12:00:00.000Z',
        grossAmount: 1000,
        netAmount: 1000,
        taxAmount: 0,
        currency: 'EUR',
        exchangeRate: 40.5,
        description: 'EUR kabul testi',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/finance/income/${income.body.id}/submit`)
      .set('Authorization', authorization)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/finance/income/${income.body.id}/approve`)
      .set('Authorization', authorization)
      .expect(201);
    const posted = await request(app.getHttpServer())
      .post(`/finance/income/${income.body.id}/accounting/post`)
      .set('Authorization', authorization)
      .expect(201);

    expect(posted.body.journalEntryId).toBeTruthy();

    const lines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: posted.body.journalEntryId },
      include: { account: { select: { code: true } } },
    });

    const debit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
    expect(debit).toBeCloseTo(40500, 2);
    expect(credit).toBeCloseTo(40500, 2);
    expect(lines.some((line) => line.account.code === '120' && Number(line.debit) === 40500)).toBe(true);
    expect(lines.some((line) => line.account.code === '600' && Number(line.credit) === 40500)).toBe(true);

    const collection = await request(app.getHttpServer())
      .post(`/finance/income/${income.body.id}/collections`)
      .set('Authorization', authorization)
      .send({
        amount: 1000,
        collectionAccountId: bankAccount.id,
        method: 'TRANSFER',
        exchangeRate: 41,
        reference: `FX-${suffix}`,
      })
      .expect(201);

    expect(collection.body.realizedFxDifference).toBeCloseTo(500, 2);
    expect(collection.body.documentExchangeRate).toBeCloseTo(40.5, 6);
    expect(collection.body.settlementExchangeRate).toBeCloseTo(41, 6);

    const collectionLines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: collection.body.journalEntryId },
      include: { account: { select: { code: true } } },
    });
    expect(collectionLines.some((line) => line.account.code === '102' && Number(line.debit) === 41000)).toBe(true);
    expect(collectionLines.some((line) => line.account.code === '120' && Number(line.credit) === 40500)).toBe(true);
    expect(collectionLines.some((line) => line.account.code === '646' && Number(line.credit) === 500)).toBe(true);
  });
});
