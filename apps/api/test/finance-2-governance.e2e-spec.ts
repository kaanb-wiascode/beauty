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

  it('keeps partial collection and payment lifecycle consistent through reversals', async () => {
    const [incomeCategories, expenseCategories, accounts] = await Promise.all([
      request(app.getHttpServer()).get('/finance/setup/income-categories').set('Authorization', authorization).expect(200),
      request(app.getHttpServer()).get('/finance/setup/expense-categories').set('Authorization', authorization).expect(200),
      request(app.getHttpServer()).get('/accounting/accounts').set('Authorization', authorization).expect(200),
    ]);

    const incomeCategory = incomeCategories.body.find((item: { id: string; active: boolean }) => item.active);
    const expenseCategory = expenseCategories.body.find((item: { id: string; active: boolean }) => item.active);
    const receivable = accounts.body.find((item: { code: string }) => item.code === '120');
    const bank = accounts.body.find((item: { code: string }) => item.code === '102');
    const revenue = accounts.body.find((item: { type: string; code: string }) => item.type === 'REVENUE' && item.code !== '646');
    const expenseAccount = accounts.body.find((item: { type: string }) => item.type === 'EXPENSE');
    const payable = accounts.body.find((item: { code: string }) => item.code === '320');
    expect(incomeCategory?.id).toBeTruthy();
    expect(expenseCategory?.id).toBeTruthy();
    expect(receivable?.id).toBeTruthy();
    expect(bank?.id).toBeTruthy();
    expect(revenue?.id).toBeTruthy();
    expect(expenseAccount?.id).toBeTruthy();
    expect(payable?.id).toBeTruthy();

    await request(app.getHttpServer())
      .put('/finance/setup/income-accounting-mappings')
      .set('Authorization', authorization)
      .send({
        categoryId: incomeCategory.id,
        revenueAccountId: revenue.id,
        receivableAccountId: receivable.id,
      })
      .expect(200);

    await request(app.getHttpServer())
      .put('/finance/setup/expense-accounting-mappings')
      .set('Authorization', authorization)
      .send({
        categoryId: expenseCategory.id,
        expenseAccountId: expenseAccount.id,
        payableAccountId: payable.id,
      })
      .expect(200);

    const income = await request(app.getHttpServer())
      .post('/finance/income')
      .set('Authorization', authorization)
      .send({
        categoryId: incomeCategory.id,
        transactionDate: '2198-03-10T12:00:00.000Z',
        grossAmount: 1000,
        netAmount: 1000,
        taxAmount: 0,
        currency: 'TRY',
        exchangeRate: 1,
        description: 'Kısmi tahsilat kabul testi',
      })
      .expect(201);

    await request(app.getHttpServer()).post(`/finance/income/${income.body.id}/submit`).set('Authorization', authorization).expect(201);
    await request(app.getHttpServer()).post(`/finance/income/${income.body.id}/approve`).set('Authorization', authorization).expect(201);
    await request(app.getHttpServer()).post(`/finance/income/${income.body.id}/accounting/post`).set('Authorization', authorization).expect(201);

    const collection1 = await request(app.getHttpServer())
      .post(`/finance/income/${income.body.id}/collections`)
      .set('Authorization', authorization)
      .send({ amount: 400, collectionAccountId: bank.id, method: 'TRANSFER', collectedAt: '2198-03-11T12:00:00.000Z' })
      .expect(201);
    expect(collection1.body.collectionStatus).toBe('PARTIALLY_COLLECTED');
    expect(collection1.body.remainingAmount).toBeCloseTo(600, 2);

    const collection2 = await request(app.getHttpServer())
      .post(`/finance/income/${income.body.id}/collections`)
      .set('Authorization', authorization)
      .send({ amount: 600, collectionAccountId: bank.id, method: 'TRANSFER', collectedAt: '2198-03-12T12:00:00.000Z' })
      .expect(201);
    expect(collection2.body.collectionStatus).toBe('COLLECTED');
    expect(collection2.body.remainingAmount).toBeCloseTo(0, 2);

    const reverseCollection2 = await request(app.getHttpServer())
      .post(`/finance/income/${income.body.id}/collections/${collection2.body.id}/reverse`)
      .set('Authorization', authorization)
      .send({ reason: 'İkinci kısmi tahsilatı geri al' })
      .expect(201);
    expect(reverseCollection2.body.collectionStatus).toBe('PARTIALLY_COLLECTED');
    expect(reverseCollection2.body.remainingAmount).toBeCloseTo(600, 2);

    const reverseCollection1 = await request(app.getHttpServer())
      .post(`/finance/income/${income.body.id}/collections/${collection1.body.id}/reverse`)
      .set('Authorization', authorization)
      .send({ reason: 'İlk kısmi tahsilatı geri al' })
      .expect(201);
    expect(reverseCollection1.body.collectionStatus).toBe('UNCOLLECTED');
    expect(reverseCollection1.body.remainingAmount).toBeCloseTo(1000, 2);

    const expense = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', authorization)
      .send({
        categoryId: expenseCategory.id,
        transactionDate: '2198-03-10T12:00:00.000Z',
        grossAmount: 1000,
        netAmount: 1000,
        taxAmount: 0,
        withholdingAmount: 0,
        currency: 'TRY',
        exchangeRate: 1,
        description: 'Kısmi ödeme kabul testi',
      })
      .expect(201);

    await request(app.getHttpServer()).post(`/finance/expenses/${expense.body.id}/submit`).set('Authorization', authorization).expect(201);
    await request(app.getHttpServer()).post(`/finance/expenses/${expense.body.id}/approve`).set('Authorization', authorization).expect(201);
    await request(app.getHttpServer()).post(`/finance/expenses/${expense.body.id}/accounting/prepare`).set('Authorization', authorization).expect(201);
    await request(app.getHttpServer()).post(`/finance/expenses/${expense.body.id}/accounting/post`).set('Authorization', authorization).expect(201);

    const payment1 = await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/payments`)
      .set('Authorization', authorization)
      .send({ amount: 400, paymentAccountId: bank.id, method: 'TRANSFER', paidAt: '2198-03-11T12:00:00.000Z' })
      .expect(201);
    expect(payment1.body.paymentStatus).toBe('PARTIALLY_PAID');
    expect(payment1.body.remainingAmount).toBeCloseTo(600, 2);

    const payment2 = await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/payments`)
      .set('Authorization', authorization)
      .send({ amount: 600, paymentAccountId: bank.id, method: 'TRANSFER', paidAt: '2198-03-12T12:00:00.000Z' })
      .expect(201);
    expect(payment2.body.paymentStatus).toBe('PAID');
    expect(payment2.body.remainingAmount).toBeCloseTo(0, 2);

    const reversePayment2 = await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/payments/${payment2.body.id}/reverse`)
      .set('Authorization', authorization)
      .send({ reason: 'İkinci kısmi ödemeyi geri al' })
      .expect(201);
    expect(reversePayment2.body.paymentStatus).toBe('PARTIALLY_PAID');
    expect(reversePayment2.body.remainingAmount).toBeCloseTo(600, 2);

    const reversePayment1 = await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/payments/${payment1.body.id}/reverse`)
      .set('Authorization', authorization)
      .send({ reason: 'İlk kısmi ödemeyi geri al' })
      .expect(201);
    expect(reversePayment1.body.paymentStatus).toBe('UNPAID');
    expect(reversePayment1.body.remainingAmount).toBeCloseTo(1000, 2);
  });


  it('blocks period close on unresolved finance work, then closes and reopens after resolution', async () => {
    const period = await request(app.getHttpServer())
      .post('/finance/periods')
      .set('Authorization', authorization)
      .send({
        name: 'Nisan 2198',
        startsAt: '2198-04-01T00:00:00.000Z',
        endsAt: '2198-04-30T23:59:59.999Z',
      })
      .expect(201);

    const [categories, accounts] = await Promise.all([
      request(app.getHttpServer()).get('/finance/setup/income-categories').set('Authorization', authorization).expect(200),
      request(app.getHttpServer()).get('/accounting/accounts').set('Authorization', authorization).expect(200),
    ]);
    const category = categories.body.find((item: { id: string; active: boolean }) => item.active);
    const revenue = accounts.body.find((item: { type: string; code: string }) => item.type === 'REVENUE' && item.code !== '646');
    const receivable = accounts.body.find((item: { code: string }) => item.code === '120');
    expect(category?.id).toBeTruthy();
    expect(revenue?.id).toBeTruthy();
    expect(receivable?.id).toBeTruthy();

    await request(app.getHttpServer())
      .put('/finance/setup/income-accounting-mappings')
      .set('Authorization', authorization)
      .send({
        categoryId: category.id,
        revenueAccountId: revenue.id,
        receivableAccountId: receivable.id,
      })
      .expect(200);

    const income = await request(app.getHttpServer())
      .post('/finance/income')
      .set('Authorization', authorization)
      .send({
        categoryId: category.id,
        transactionDate: '2198-04-15T12:00:00.000Z',
        grossAmount: 750,
        netAmount: 750,
        taxAmount: 0,
        currency: 'TRY',
        exchangeRate: 1,
        description: 'Dönem kapanış blokaj testi',
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

    const blockedChecklist = await request(app.getHttpServer())
      .get(`/finance/periods/${period.body.id}/close-checklist`)
      .set('Authorization', authorization)
      .expect(200);
    expect(blockedChecklist.body.closable).toBe(false);
    expect(
      blockedChecklist.body.checks.some(
        (check: { code: string; count: number }) =>
          check.code === 'UNPOSTED_INCOME' && Number(check.count) >= 1,
      ),
    ).toBe(true);

    const blockedClose = await request(app.getHttpServer())
      .post(`/finance/periods/${period.body.id}/close`)
      .set('Authorization', authorization)
      .send({ reason: 'Blokaj varken kapanmamalı' });
    expect(blockedClose.status).toBe(400);

    await request(app.getHttpServer())
      .post(`/finance/income/${income.body.id}/accounting/post`)
      .set('Authorization', authorization)
      .expect(201);

    const clearChecklist = await request(app.getHttpServer())
      .get(`/finance/periods/${period.body.id}/close-checklist`)
      .set('Authorization', authorization)
      .expect(200);
    expect(clearChecklist.body.closable).toBe(true);

    const closed = await request(app.getHttpServer())
      .post(`/finance/periods/${period.body.id}/close`)
      .set('Authorization', authorization)
      .send({ reason: 'Acceptance close' })
      .expect(201);
    expect(closed.body.status).toBe('CLOSED');

    const reopened = await request(app.getHttpServer())
      .post(`/finance/periods/${period.body.id}/reopen`)
      .set('Authorization', authorization)
      .expect(201);
    expect(reopened.body.status).toBe('OPEN');
  });


  it('posts USD expense settlement FX loss and protects closed-period cash mutations', async () => {
    const [expenseCategories, accounts] = await Promise.all([
      request(app.getHttpServer()).get('/finance/setup/expense-categories').set('Authorization', authorization).expect(200),
      request(app.getHttpServer()).get('/accounting/accounts').set('Authorization', authorization).expect(200),
    ]);
    const category = expenseCategories.body.find((item: { id: string; active: boolean }) => item.active);
    const bank = accounts.body.find((item: { code: string }) => item.code === '102');
    const expenseAccount = accounts.body.find((item: { type: string; code: string }) => item.type === 'EXPENSE' && item.code !== '656');
    const payable = accounts.body.find((item: { type: string }) => item.type === 'LIABILITY');
    expect(category?.id).toBeTruthy();
    expect(bank?.id).toBeTruthy();
    expect(expenseAccount?.id).toBeTruthy();
    expect(payable?.id).toBeTruthy();

    await request(app.getHttpServer())
      .put('/finance/setup/expense-accounting-mappings')
      .set('Authorization', authorization)
      .send({
        categoryId: category.id,
        expenseAccountId: expenseAccount.id,
        payableAccountId: payable.id,
      })
      .expect(200);

    const expense = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', authorization)
      .send({
        categoryId: category.id,
        transactionDate: '2198-06-10T12:00:00.000Z',
        grossAmount: 1000,
        netAmount: 1000,
        taxAmount: 0,
        withholdingAmount: 0,
        currency: 'USD',
        exchangeRate: 35,
        description: 'USD kur farkı kabul testi',
      })
      .expect(201);

    await request(app.getHttpServer()).post(`/finance/expenses/${expense.body.id}/submit`).set('Authorization', authorization).expect(201);
    await request(app.getHttpServer()).post(`/finance/expenses/${expense.body.id}/approve`).set('Authorization', authorization).expect(201);
    await request(app.getHttpServer()).post(`/finance/expenses/${expense.body.id}/accounting/prepare`).set('Authorization', authorization).expect(201);
    await request(app.getHttpServer()).post(`/finance/expenses/${expense.body.id}/accounting/post`).set('Authorization', authorization).expect(201);

    const payment = await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/payments`)
      .set('Authorization', authorization)
      .send({
        amount: 1000,
        paymentAccountId: bank.id,
        method: 'TRANSFER',
        exchangeRate: 36,
        paidAt: '2198-06-11T12:00:00.000Z',
      })
      .expect(201);

    expect(payment.body.realizedFxDifference).toBeCloseTo(1000, 2);
    const paymentLines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: payment.body.journalEntryId },
      include: { account: { select: { code: true } } },
    });
    expect(paymentLines.some((line) => line.account.code === '320' && Number(line.debit) === 35000)).toBe(true);
    expect(paymentLines.some((line) => line.account.code === '102' && Number(line.credit) === 36000)).toBe(true);
    expect(paymentLines.some((line) => line.account.code === '656' && Number(line.debit) === 1000)).toBe(true);

    await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/payments/${payment.body.id}/reverse`)
      .set('Authorization', authorization)
      .send({ reason: 'Kapalı dönem ödeme kontrolü öncesi borcu yeniden aç' })
      .expect(201);

    const closedPeriod = await request(app.getHttpServer())
      .post('/finance/periods')
      .set('Authorization', authorization)
      .send({
        name: 'Temmuz 2198',
        startsAt: '2198-07-01T00:00:00.000Z',
        endsAt: '2198-07-31T23:59:59.999Z',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/finance/periods/${closedPeriod.body.id}/close`)
      .set('Authorization', authorization)
      .send({ reason: 'Kapalı dönem mutation matrix' })
      .expect(201);

    const blockedPayment = await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/payments`)
      .set('Authorization', authorization)
      .send({
        amount: 1,
        paymentAccountId: bank.id,
        method: 'TRANSFER',
        exchangeRate: 36,
        paidAt: '2198-07-15T12:00:00.000Z',
      });
    expect(blockedPayment.status).toBe(400);
    expect(String(blockedPayment.body.message)).toContain('kapalı finansal döneme');

    const incomeCategories = await request(app.getHttpServer())
      .get('/finance/setup/income-categories')
      .set('Authorization', authorization)
      .expect(200);
    const incomeCategory = incomeCategories.body.find((item: { id: string; active: boolean }) => item.active);
    const receivable = accounts.body.find((item: { code: string }) => item.code === '120');
    const revenue = accounts.body.find((item: { type: string; code: string }) => item.type === 'REVENUE' && item.code !== '646');
    expect(incomeCategory?.id).toBeTruthy();

    await request(app.getHttpServer())
      .put('/finance/setup/income-accounting-mappings')
      .set('Authorization', authorization)
      .send({
        categoryId: incomeCategory.id,
        revenueAccountId: revenue.id,
        receivableAccountId: receivable.id,
      })
      .expect(200);

    const income = await request(app.getHttpServer())
      .post('/finance/income')
      .set('Authorization', authorization)
      .send({
        categoryId: incomeCategory.id,
        transactionDate: '2198-08-10T12:00:00.000Z',
        grossAmount: 500,
        netAmount: 500,
        taxAmount: 0,
        currency: 'TRY',
        exchangeRate: 1,
        description: 'Kapalı dönem tahsilat matrix kaydı',
      })
      .expect(201);
    await request(app.getHttpServer()).post(`/finance/income/${income.body.id}/submit`).set('Authorization', authorization).expect(201);
    await request(app.getHttpServer()).post(`/finance/income/${income.body.id}/approve`).set('Authorization', authorization).expect(201);
    await request(app.getHttpServer()).post(`/finance/income/${income.body.id}/accounting/post`).set('Authorization', authorization).expect(201);

    const blockedCollection = await request(app.getHttpServer())
      .post(`/finance/income/${income.body.id}/collections`)
      .set('Authorization', authorization)
      .send({
        amount: 100,
        collectionAccountId: bank.id,
        method: 'TRANSFER',
        collectedAt: '2198-07-15T12:00:00.000Z',
      });
    expect(blockedCollection.status).toBe(400);
    expect(String(blockedCollection.body.message)).toContain('kapalı finansal döneme');
  });

});
