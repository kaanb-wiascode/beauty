import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';

jest.setTimeout(60_000);

describe('Corporate communications revenue attribution (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('links a won CRM sale and tracks net completed collections through refunds', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const tenant = await prisma.tenant.create({
      data: { name: `Attribution ${suffix}`, slug: `attribution-${suffix}` },
    });
    const company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: `Attribution Company ${suffix}`,
        slug: `attribution-company-${suffix}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: 'Merkez',
        code: `ATR-${suffix.slice(0, 7).toUpperCase()}`,
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `attribution-${suffix}@example.test`,
        passwordHash: 'not-used',
        firstName: 'Attribution',
        lastName: 'Owner',
      },
    });
    const customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        firstName: 'Marketing',
        lastName: 'Customer',
        email: `customer-${suffix}@example.test`,
        customerSource: 'OTHER',
      },
    });

    const crmLeadId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO crm_leads(
         id,tenant_id,company_id,branch_id,customer_id,first_name,last_name,email,
         source,status,created_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,'Marketing','Lead',$6,
         'MARKETING_META','CONVERTED',$7::text)`,
      crmLeadId,
      tenant.id,
      company.id,
      branch.id,
      customer.id,
      `lead-${suffix}@example.test`,
      user.id,
    );

    const opportunityId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO crm_opportunities(
         id,tenant_id,company_id,branch_id,lead_id,customer_id,title,stage,
         estimated_value,currency,probability,created_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7,'WON',
         350,'TRY',100,$8::text)`,
      opportunityId,
      tenant.id,
      company.id,
      branch.id,
      crmLeadId,
      customer.id,
      `Marketing Opportunity ${suffix}`,
      user.id,
    );

    const marketingLeadId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_marketing_leads(
         id,tenant_id,company_id,branch_id,provider,external_lead_id,first_name,last_name,
         email,status,crm_lead_id,customer_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,'META',$5,'Marketing','Lead',$6,
         'IN_CRM',$7::text,$8::text)`,
      marketingLeadId,
      tenant.id,
      company.id,
      branch.id,
      `meta-${suffix}`,
      `lead-${suffix}@example.test`,
      crmLeadId,
      customer.id,
    );

    const sale = await prisma.sale.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        customerId: customer.id,
        subtotal: 350,
        discountTotal: 0,
        total: 350,
      },
    });

    await prisma.$executeRawUnsafe(
      `UPDATE crm_opportunities
       SET sale_id=$1::text,
           commercial_snapshot=$2::jsonb,
           converted_at=NOW(),
           version=version+1,
           updated_at=NOW()
       WHERE id=$3::text`,
      sale.id,
      JSON.stringify({ saleId: sale.id, customerId: customer.id, total: 350 }),
      opportunityId,
    );

    const linkedRows = await prisma.$queryRawUnsafe<
      Array<{ saleId: string | null; status: string; revenueAmount: unknown }>
    >(
      `SELECT sale_id AS "saleId",status,revenue_amount AS "revenueAmount"
       FROM corporate_marketing_leads WHERE id=$1::text`,
      marketingLeadId,
    );
    expect(linkedRows[0]?.saleId).toBe(sale.id);
    expect(linkedRows[0]?.status).toBe('WON');
    expect(Number(linkedRows[0]?.revenueAmount ?? 0)).toBe(0);

    const firstPayment = await prisma.salePayment.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        saleId: sale.id,
        amount: 250,
        method: 'CARD',
      },
    });

    let revenueRows = await prisma.$queryRawUnsafe<Array<{ revenueAmount: unknown }>>(
      `SELECT revenue_amount AS "revenueAmount"
       FROM corporate_marketing_leads WHERE id=$1::text`,
      marketingLeadId,
    );
    expect(Number(revenueRows[0]?.revenueAmount ?? 0)).toBe(250);

    await prisma.salePayment.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        saleId: sale.id,
        amount: 100,
        method: 'CASH',
      },
    });

    revenueRows = await prisma.$queryRawUnsafe<Array<{ revenueAmount: unknown }>>(
      `SELECT revenue_amount AS "revenueAmount"
       FROM corporate_marketing_leads WHERE id=$1::text`,
      marketingLeadId,
    );
    expect(Number(revenueRows[0]?.revenueAmount ?? 0)).toBe(350);

    await prisma.salePayment.update({
      where: { id: firstPayment.id },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date(),
        refundReason: 'Attribution refund verification',
      },
    });

    revenueRows = await prisma.$queryRawUnsafe<Array<{ revenueAmount: unknown }>>(
      `SELECT revenue_amount AS "revenueAmount"
       FROM corporate_marketing_leads WHERE id=$1::text`,
      marketingLeadId,
    );
    expect(Number(revenueRows[0]?.revenueAmount ?? 0)).toBe(100);

    const touchpoints = await prisma.$queryRawUnsafe<Array<{ touchType: string }>>(
      `SELECT touch_type AS "touchType"
       FROM corporate_marketing_touchpoints
       WHERE marketing_lead_id=$1::text
       ORDER BY occurred_at,id`,
      marketingLeadId,
    );
    expect(touchpoints.map((row) => row.touchType)).toEqual([
      'SALE_CREATED',
      'PAYMENT_COMPLETED',
      'PAYMENT_COMPLETED',
      'PAYMENT_REFUNDED',
    ]);
  });
});
