import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(120_000);

describe('Finance 2.0 sales to bank acceptance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string | null = null;
  let companyId = '';
  let branchId = '';
  let authorization = '';
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const password = 'FinanceSalesAcceptance!2026';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new PrismaExceptionFilter(), new ZodExceptionFilter());
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `finance-sales-${suffix}@example.test`,
        password,
        firstName: 'Finance',
        lastName: 'Sales',
        tenantName: `Finance Sales ${suffix}`,
        tenantSlug: `finance-sales-${suffix}`,
      })
      .expect(201);

    tenantId = String(registered.body.tenant.id);
    companyId = String(registered.body.company.id);
    branchId = String(registered.body.branch.id);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `finance-sales-${suffix}@example.test`, password })
      .expect(201);

    const switched = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ membershipId: registered.body.membership.id, branchId })
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

  it('flows card sale through Finance, POS settlement, bank reconciliation and CFO', async () => {
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', authorization)
      .send({
        firstName: 'Acceptance',
        lastName: 'Customer',
        email: `acceptance-customer-${suffix}@example.test`,
        customerSource: 'WALK_IN',
      })
      .expect(201);

    const service = await request(app.getHttpServer())
      .post('/services')
      .set('Authorization', authorization)
      .send({
        name: `Acceptance Service ${suffix}`,
        durationMinutes: 60,
        price: 1000,
        cost: 200,
        taxRate: 0,
        currency: 'TRY',
      })
      .expect(201);

    const sale = await request(app.getHttpServer())
      .post('/sales')
      .set('Authorization', authorization)
      .send({
        customerId: customer.body.id,
        discountTotal: 0,
        items: [{ type: 'SERVICE', referenceId: service.body.id, quantity: 1 }],
      })
      .expect(201);

    const confirmed = await request(app.getHttpServer())
      .post(`/sales/${sale.body.id}/confirm`)
      .set('Authorization', authorization)
      .expect(201);
    expect(confirmed.body.status).toBe('CONFIRMED');

    const incomeRows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      sourceId: string;
      currency: string;
      accountingStatus: string;
      collectionStatus: string;
    }>>(
      `SELECT id,source_id AS "sourceId",currency,
              accounting_status::text AS "accountingStatus",
              collection_status::text AS "collectionStatus"
       FROM income_records
       WHERE tenant_id=$1::text AND company_id=$2::text
         AND source_type='SALE' AND source_id=$3::text`,
      tenantId,
      companyId,
      sale.body.id,
    );
    expect(incomeRows).toHaveLength(1);
    expect(incomeRows[0]).toEqual(expect.objectContaining({
      sourceId: sale.body.id,
      currency: 'TRY',
      accountingStatus: 'POSTED',
      collectionStatus: 'UNCOLLECTED',
    }));

    const paymentReference = `POS-${suffix}`;
    const paymentResponse = await request(app.getHttpServer())
      .post(`/sales/${sale.body.id}/payments`)
      .set('Authorization', authorization)
      .send({
        amount: 1000,
        method: 'CARD',
        reference: paymentReference,
        note: 'Finance 2 acceptance card payment',
      })
      .expect(201);

    const salePaymentId = String(paymentResponse.body.payment.id);
    expect(paymentResponse.body.summary.paymentStatus).toBe('PAID');

    const collectionRows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      amount: string;
      exchangeRate: string;
      accountCode: string;
    }>>(
      `SELECT c.id,c.amount,c.exchange_rate AS "exchangeRate",coa.code AS "accountCode"
       FROM income_collections c
       JOIN chart_of_accounts coa ON coa.id=c.collection_account_id
       WHERE c.tenant_id=$1::text AND c.company_id=$2::text
         AND c.source_type='SALE_PAYMENT' AND c.source_id=$3::text`,
      tenantId,
      companyId,
      salePaymentId,
    );
    expect(collectionRows).toHaveLength(1);
    expect(Number(collectionRows[0].amount)).toBe(1000);
    expect(Number(collectionRows[0].exchangeRate)).toBe(1);
    expect(collectionRows[0].accountCode).toBe('108');

    const posIntegrationId = randomUUID();
    const bankIntegrationId = randomUUID();
    const bankAccountId = randomUUID();
    const posTerminalId = randomUUID();
    const posTransactionId = randomUUID();

    await prisma.$executeRawUnsafe(
      `INSERT INTO finance_integrations(
         id,tenant_id,company_id,branch_id,kind,provider,display_name,status,auth_type,metadata
       ) VALUES
         ($1::text,$2::text,$3::text,$4::text,'VIRTUAL_POS','ACCEPTANCE_POS',$5,'CONNECTED','MANUAL','{}'::jsonb),
         ($6::text,$2::text,$3::text,$4::text,'OPEN_BANKING','ACCEPTANCE_BANK',$7,'CONNECTED','MANUAL','{}'::jsonb)`,
      posIntegrationId,
      tenantId,
      companyId,
      branchId,
      `Acceptance POS ${suffix}`,
      bankIntegrationId,
      `Acceptance Bank ${suffix}`,
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO bank_accounts(
         id,tenant_id,company_id,branch_id,integration_id,external_account_id,
         bank_name,account_name,currency,available_balance,current_balance,balance_as_of,active
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,$8,'TRY',980,980,NOW(),true)`,
      bankAccountId,
      tenantId,
      companyId,
      branchId,
      bankIntegrationId,
      `bank-${suffix}`,
      'Acceptance Bank',
      `Acceptance Account ${suffix}`,
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO pos_terminals(
         id,tenant_id,company_id,branch_id,integration_id,external_terminal_id,name,currency,active
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,$7,'TRY',true)`,
      posTerminalId,
      tenantId,
      companyId,
      branchId,
      posIntegrationId,
      `terminal-${suffix}`,
      `Acceptance POS Terminal ${suffix}`,
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO pos_transactions(
         id,tenant_id,company_id,branch_id,terminal_id,integration_id,provider_transaction_id,
         status,amount,fee_amount,net_amount,currency,expected_settlement_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,'CAPTURED',1000,20,980,'TRY',NOW())`,
      posTransactionId,
      tenantId,
      companyId,
      branchId,
      posTerminalId,
      posIntegrationId,
      paymentReference,
    );

    const linked = await request(app.getHttpServer())
      .post('/financial-integrations/pos/payment-links/auto')
      .set('Authorization', authorization)
      .send({ limit: 20 })
      .expect(201);
    expect(linked.body.linked).toBeGreaterThanOrEqual(1);

    const posLink = await prisma.$queryRawUnsafe<Array<{ salePaymentId: string | null }>>(
      `SELECT sale_payment_id AS "salePaymentId" FROM pos_transactions WHERE id=$1::text`,
      posTransactionId,
    );
    expect(posLink[0]?.salePaymentId).toBe(salePaymentId);

    const settlement = await request(app.getHttpServer())
      .post(`/financial-integrations/${posIntegrationId}/pos/settlements`)
      .set('Authorization', authorization)
      .send({
        providerSettlementId: `settlement-${suffix}`,
        bankAccountId,
        transactionIds: [posTransactionId],
        settledAt: new Date().toISOString(),
      })
      .expect(201);

    expect(Number(settlement.body.netAmount)).toBe(980);

    const bankTransactionId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO bank_transactions(
         id,tenant_id,company_id,branch_id,bank_account_id,external_transaction_id,
         booked_at,amount,currency,description,reconciliation_status
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,NOW(),980,'TRY',$7,'UNMATCHED')`,
      bankTransactionId,
      tenantId,
      companyId,
      branchId,
      bankAccountId,
      `bank-tx-${suffix}`,
      `POS settlement ${suffix}`,
    );

    const suggestions = await request(app.getHttpServer())
      .get(`/financial-integrations/pos/settlements/${settlement.body.id}/reconciliation-suggestions`)
      .set('Authorization', authorization)
      .expect(200);
    expect(suggestions.body.suggestions.some((item: { id: string }) => item.id === bankTransactionId)).toBe(true);

    const matched = await request(app.getHttpServer())
      .post(`/financial-integrations/pos/settlements/${settlement.body.id}/match-bank-transaction`)
      .set('Authorization', authorization)
      .send({
        bankTransactionId,
        confidence: 100,
        note: 'Finance 2 acceptance match',
      })
      .expect(201);
    expect(matched.body.reconciliationStatus).toBe('MATCHED');

    const summary = await request(app.getHttpServer())
      .get('/financial-integrations/pos/reconciliation/summary')
      .set('Authorization', authorization)
      .expect(200);
    expect(summary.body.matched).toBeGreaterThanOrEqual(1);

    const cfo = await request(app.getHttpServer())
      .get('/profitability/cfo/management-cockpit')
      .set('Authorization', authorization)
      .expect(200);
    expect(cfo.body.baseCurrency).toBe('TRY');
    expect(cfo.body.liquidity).toBeTruthy();

    const control = await request(app.getHttpServer())
      .get('/finance/control/projection')
      .set('Authorization', authorization)
      .expect(200);
    expect(control.body.ledger).toEqual(expect.objectContaining({
      posReceivable: expect.any(Number),
      bank: expect.any(Number),
      revenue: expect.any(Number),
    }));

    const integrity = await request(app.getHttpServer())
      .get('/finance/control/integrity')
      .set('Authorization', authorization)
      .expect(200);
    expect(integrity.body.healthy).toBe(true);
    expect(integrity.body.issueCount).toBe(0);

    const kpiValidation = await request(app.getHttpServer())
      .get('/finance/control/kpi-validation')
      .set('Authorization', authorization)
      .expect(200);
    expect(kpiValidation.body.valid).toBe(true);
    expect(kpiValidation.body.baseCurrency).toBe('TRY');
  });
});
