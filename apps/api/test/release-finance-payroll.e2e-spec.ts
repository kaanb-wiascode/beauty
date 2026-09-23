import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(120_000);

describe('Release payroll and finance reconciliation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string | null = null;

  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const password = 'ReleaseAcceptance!2026';

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
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app.close();
  });

  it('posts and reverses payroll settlement and finance reconciliation', async () => {
    const email = `release-finance-${suffix}@example.test`;
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'Release',
        lastName: 'Finance',
        tenantName: `Release Finance ${suffix}`,
        tenantSlug: `release-finance-${suffix}`,
      })
      .expect(201);

    const currentTenantId = String(registered.body.tenant.id);
    tenantId = currentTenantId;
    const companyId = String(registered.body.company.id);
    const branchId = registered.body.branch.id;
    const membershipId = registered.body.membership.id;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const switched = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ membershipId, branchId })
      .expect(201);

    const authorization = `Bearer ${switched.body.accessToken}`;

    const ownerRole = await prisma.role.findFirstOrThrow({
      where: { tenantId: currentTenantId, companyId, slug: 'owner' },
      select: { id: true },
    });
    const hrSensitive = await prisma.permission.upsert({
      where: {
        resource_action: { resource: 'hr_sensitive', action: 'read' },
      },
      update: {},
      create: {
        resource: 'hr_sensitive',
        action: 'read',
        description: 'HR sensitive read permission',
      },
      select: { id: true },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: ownerRole.id,
          permissionId: hrSensitive.id,
        },
      },
      update: {},
      create: {
        roleId: ownerRole.id,
        permissionId: hrSensitive.id,
      },
    });

    const staff = await request(app.getHttpServer())
      .post('/staff')
      .set('Authorization', authorization)
      .send({
        firstName: 'Payroll',
        lastName: 'Acceptance',
        email: `payroll-${suffix}@example.test`,
      })
      .expect(201);

    const period = await request(app.getHttpServer())
      .post('/hr/payroll/periods')
      .set('Authorization', authorization)
      .send({ year: 2199, month: 12 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/hr/payroll/periods/${period.body.id}/items`)
      .set('Authorization', authorization)
      .send({
        staffId: staff.body.id,
        branchId,
        grossAmount: 1000,
        netAmount: 770,
        incomeTax: 100,
        stampTax: 10,
        employeeSocialSecurity: 100,
        unemploymentEmployee: 20,
        employerSocialSecurity: 150,
        unemploymentEmployer: 20,
        otherDeductions: 0,
        employerCost: 1170,
        note: 'Release acceptance payroll',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/hr/payroll/periods/${period.body.id}/submit`)
      .set('Authorization', authorization)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/hr/payroll/periods/${period.body.id}/approve`)
      .set('Authorization', authorization)
      .expect(201);

    const postedPayroll = await request(app.getHttpServer())
      .post(`/hr/payroll/periods/${period.body.id}/post`)
      .set('Authorization', authorization)
      .expect(201);
    expect(postedPayroll.body.status).toBe('POSTED');
    expect(postedPayroll.body.journalEntryId).toBeTruthy();

    const salaryPayment = await request(app.getHttpServer())
      .post(`/hr/payroll/periods/${period.body.id}/payments`)
      .set('Authorization', authorization)
      .send({
        staffId: staff.body.id,
        amount: 770,
        method: 'BANK',
        note: 'Release acceptance salary settlement',
      })
      .expect(201);
    expect(salaryPayment.body.status).toBe('PAID');

    const reversedSalary = await request(app.getHttpServer())
      .post(`/hr/payroll/payments/${salaryPayment.body.paymentId}/reverse`)
      .set('Authorization', authorization)
      .send({ reason: 'Release acceptance salary reversal' })
      .expect(201);
    expect(reversedSalary.body.status).toBe('REVERSED');

    await request(app.getHttpServer())
      .post('/finance/setup/bootstrap-default-taxonomy')
      .set('Authorization', authorization)
      .expect(201);

    const categories = await request(app.getHttpServer())
      .get('/finance/setup/expense-categories')
      .set('Authorization', authorization)
      .expect(200);
    const category = categories.body.find((item: { id: string; active: boolean }) => item.active);
    expect(category?.id).toBeTruthy();

    const accounts = await request(app.getHttpServer())
      .get('/accounting/accounts')
      .set('Authorization', authorization)
      .expect(200);
    const expenseAccount = accounts.body.find((item: { code: string }) => item.code === '770');
    const payableAccount = accounts.body.find((item: { code: string }) => item.code === '335');
    const bankAssetAccount = accounts.body.find((item: { code: string }) => item.code === '102');
    expect(expenseAccount?.id).toBeTruthy();
    expect(payableAccount?.id).toBeTruthy();
    expect(bankAssetAccount?.id).toBeTruthy();

    await request(app.getHttpServer())
      .put('/finance/setup/expense-accounting-mappings')
      .set('Authorization', authorization)
      .send({
        categoryId: category.id,
        expenseAccountId: expenseAccount.id,
        payableAccountId: payableAccount.id,
      })
      .expect(200);

    const expense = await request(app.getHttpServer())
      .post('/finance/expenses')
      .set('Authorization', authorization)
      .send({
        categoryId: category.id,
        transactionDate: new Date().toISOString(),
        grossAmount: 100,
        netAmount: 100,
        taxAmount: 0,
        withholdingAmount: 0,
        currency: 'TRY',
        exchangeRate: 1,
        description: `Release reconciliation ${suffix}`,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/submit`)
      .set('Authorization', authorization)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/approve`)
      .set('Authorization', authorization)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/accounting/prepare`)
      .set('Authorization', authorization)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/accounting/post`)
      .set('Authorization', authorization)
      .expect(201);

    const expensePayment = await request(app.getHttpServer())
      .post(`/finance/expenses/${expense.body.id}/payments`)
      .set('Authorization', authorization)
      .send({
        amount: 100,
        paymentAccountId: bankAssetAccount.id,
        method: 'TRANSFER',
        reference: `RECON-${suffix}`,
        note: 'Release acceptance expense payment',
      })
      .expect(201);

    const integrationId = randomUUID();
    const bankAccountId = randomUUID();
    const bankTransactionId = randomUUID();

    await prisma.$executeRawUnsafe(
      `INSERT INTO finance_integrations(
         id,tenant_id,company_id,branch_id,kind,provider,display_name,status,auth_type,metadata
       ) VALUES($1::text,$2::text,$3::text,$4::text,'OPEN_BANKING','STAGING_ACCEPTANCE',$5,'CONNECTED','MANUAL','{}'::jsonb)`,
      integrationId, currentTenantId, companyId, branchId, `Release Acceptance Bank ${suffix}`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO bank_accounts(
         id,tenant_id,company_id,branch_id,integration_id,external_account_id,
         bank_name,account_name,currency,active,updated_at
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,'Release Acceptance Bank',$7,'TRY',true,NOW())`,
      bankAccountId, currentTenantId, companyId, branchId, integrationId, `account-${suffix}`, `Acceptance ${suffix}`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO bank_transactions(
         id,tenant_id,company_id,branch_id,bank_account_id,external_transaction_id,
         booked_at,amount,currency,description,reconciliation_status
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6,NOW(),-100,'TRY',$7,'UNMATCHED')`,
      bankTransactionId, currentTenantId, companyId, branchId, bankAccountId, `transaction-${suffix}`, `RECON-${suffix}`,
    );

    const suggestions = await request(app.getHttpServer())
      .get(`/finance/reconciliation/expense-payments/${expensePayment.body.id}/suggestions`)
      .set('Authorization', authorization)
      .expect(200);
    expect(
      suggestions.body.suggestions.some((item: { id: string }) => item.id === bankTransactionId),
    ).toBe(true);

    const matched = await request(app.getHttpServer())
      .post(`/finance/reconciliation/expense-payments/${expensePayment.body.id}/match`)
      .set('Authorization', authorization)
      .send({ bankTransactionId, amount: 100 })
      .expect(201);
    expect(matched.body.id).toBeTruthy();

    const reversedMatch = await request(app.getHttpServer())
      .post(`/finance/reconciliation/${matched.body.id}/reverse`)
      .set('Authorization', authorization)
      .send({ reason: 'Release acceptance reconciliation reversal' })
      .expect(201);
    expect(reversedMatch.body.reversedAt).toBeTruthy();

    const bankRows = await prisma.$queryRawUnsafe<Array<{ reconciliationStatus: string }>>(
      `SELECT reconciliation_status AS "reconciliationStatus" FROM bank_transactions WHERE id=$1::text`,
      bankTransactionId,
    );
    expect(bankRows[0]?.reconciliationStatus).toBe('UNMATCHED');
  });
});
