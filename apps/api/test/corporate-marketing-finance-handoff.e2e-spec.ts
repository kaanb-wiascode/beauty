import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(60_000);

describe('Corporate marketing finance handoff (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new PrismaExceptionFilter(), new ZodExceptionFilter());
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    jwt = moduleFixture.get(JwtService);
  });

  afterAll(async () => app.close());

  it('moves an agency fee into AP/accounting once and reverses the original expense account', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const tenant = await prisma.tenant.create({ data: { name: `Mkt Finance ${suffix}`, slug: `mkt-fin-${suffix}` } });
    const company = await prisma.company.create({ data: { tenantId: tenant.id, name: `Mkt Finance Co ${suffix}`, slug: `mkt-fin-co-${suffix}` } });
    const branch = await prisma.branch.create({ data: { companyId: company.id, name: 'Main', code: `MF-${suffix.slice(0, 6)}` } });

    const communications = await actor('communications', ['communications.read', 'communications.manage']);
    const finance = await actor('finance', ['finance.read', 'finance.manage']);

    const vendor = await request(app.getHttpServer())
      .post('/corporate-communications/vendors')
      .set('Authorization', communications)
      .send({
        name: `Integrated Agency ${suffix}`,
        vendorType: 'AD_AGENCY',
        branchId: branch.id,
        monthlyFee: 60000,
        currency: 'TRY',
        paymentModel: 'MONTHLY_RETAINER',
      })
      .expect(201);

    const queue = await request(app.getHttpServer())
      .get('/marketing-finance/expenses?status=PENDING_FINANCE')
      .set('Authorization', finance)
      .expect(200);
    const expense = queue.body.find((row: { vendorId?: string }) => row.vendorId === vendor.body.id);
    expect(expense).toBeDefined();
    expect(Number(expense.amount)).toBe(60000);
    expect(expense.category).toBe('AGENCY_FEE');
    expect(expense.expenseAccountCode).toBe('760.04');

    const supplierId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO inventory_suppliers(id,tenant_id,company_id,name,status)
       VALUES($1::text,$2::text,$3::text,$4,'ACTIVE')`,
      supplierId,
      tenant.id,
      company.id,
      `Integrated Agency Supplier ${suffix}`,
    );

    const posted = await request(app.getHttpServer())
      .post(`/marketing-finance/expenses/${expense.id}/account`)
      .set('Authorization', finance)
      .send({ supplierId, invoiceNumber: `MKT-${suffix}`, dueAt: '2026-09-30' })
      .expect(201);
    expect(posted.body.idempotent).toBe(false);
    expect(posted.body.supplierBillId).toBeTruthy();

    const bills = await prisma.$queryRawUnsafe<Array<{ id: string; sourceType: string; sourceId: string; amount: unknown }>>(
      `SELECT id,source_type AS "sourceType",source_id AS "sourceId",amount
       FROM supplier_bills WHERE company_id=$1::text AND source_type='MARKETING_EXPENSE' AND source_id=$2::text`,
      company.id,
      expense.id,
    );
    expect(bills).toHaveLength(1);
    expect(Number(bills[0].amount)).toBe(60000);

    const journal = await prisma.journalEntry.findFirst({
      where: { companyId: company.id, referenceType: 'SUPPLIER_BILL', referenceId: bills[0].id },
      include: { lines: { include: { account: true } } },
    });
    expect(journal?.status).toBe('POSTED');
    expect(journal?.lines).toHaveLength(2);
    const expenseDebit = journal?.lines.find((line) => Number(line.debit) > 0);
    expect(expenseDebit?.account.code).toBe('760.04');
    expect(Number(expenseDebit?.debit)).toBe(60000);

    const repeat = await request(app.getHttpServer())
      .post(`/marketing-finance/expenses/${expense.id}/account`)
      .set('Authorization', finance)
      .send({ supplierId, invoiceNumber: `MKT-${suffix}` })
      .expect(201);
    expect(repeat.body.idempotent).toBe(true);
    expect(repeat.body.supplierBillId).toBe(bills[0].id);

    await request(app.getHttpServer())
      .post(`/accounts-payable/bills/${bills[0].id}/cancel`)
      .set('Authorization', finance)
      .send({ reason: 'Integration reversal verification' })
      .expect(201);

    const reversal = await prisma.journalEntry.findFirst({
      where: {
        companyId: company.id,
        referenceType: 'SUPPLIER_BILL_CANCELLATION',
        referenceId: bills[0].id,
      },
      include: { lines: { include: { account: true } } },
    });
    expect(reversal?.status).toBe('POSTED');
    const expenseCredit = reversal?.lines.find((line) => Number(line.credit) > 0 && line.account.type === 'EXPENSE');
    expect(expenseCredit?.account.code).toBe('760.04');
    expect(Number(expenseCredit?.credit)).toBe(60000);

    async function actor(label: string, permissions: string[]) {
      const role = await prisma.role.create({
        data: { tenantId: tenant.id, companyId: company.id, name: label, slug: `${label}-${suffix}`, scope: 'BRANCH' },
      });
      for (const value of permissions) {
        const [resource, action] = value.split('.');
        const permission = await prisma.permission.upsert({
          where: { resource_action: { resource, action } },
          update: {},
          create: { resource, action, description: value },
        });
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      }
      const user = await prisma.user.create({
        data: { email: `${label}-${suffix}@example.test`, passwordHash: 'not-used', firstName: 'Test', lastName: label },
      });
      const membership = await prisma.membership.create({
        data: { userId: user.id, tenantId: tenant.id, companyId: company.id, roleId: role.id },
      });
      await prisma.membershipBranchAccess.create({ data: { membershipId: membership.id, branchId: branch.id } });
      return `Bearer ${jwt.sign({
        sub: user.id,
        tenantId: tenant.id,
        membershipId: membership.id,
        roleId: role.id,
        companyId: company.id,
        branchId: branch.id,
        roleScope: 'BRANCH',
      })}`;
    }
  });
});
