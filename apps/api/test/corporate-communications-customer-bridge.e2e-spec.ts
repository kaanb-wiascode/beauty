import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(60_000);

describe('Corporate communications customer bridge (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new PrismaExceptionFilter(), new ZodExceptionFilter());
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    jwt = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function setup() {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const tenant = await prisma.tenant.create({
      data: { name: `Customer Bridge ${suffix}`, slug: `customer-bridge-${suffix}` },
    });
    const company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: `Customer Bridge Company ${suffix}`,
        slug: `customer-bridge-company-${suffix}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: 'Merkez',
        code: `CBR-${suffix.slice(0, 7).toUpperCase()}`,
      },
    });
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        name: 'Bridge Team',
        slug: `bridge-team-${suffix}`,
        scope: 'BRANCH',
      },
    });
    const permission = await prisma.permission.upsert({
      where: { resource_action: { resource: 'communications', action: 'manage' } },
      update: {},
      create: {
        resource: 'communications',
        action: 'manage',
        description: 'communications manage permission',
      },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });
    const user = await prisma.user.create({
      data: {
        email: `bridge-${suffix}@example.test`,
        passwordHash: 'not-used',
        firstName: 'Bridge',
        lastName: 'Actor',
      },
    });
    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        companyId: company.id,
        roleId: role.id,
      },
    });
    await prisma.membershipBranchAccess.create({
      data: { membershipId: membership.id, branchId: branch.id },
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_lead_routing_rules(
         tenant_id,company_id,name,priority,active,target_branch_id,target_user_id,strategy,conditions,created_by_user_id
       ) VALUES($1::text,$2::text,'Bridge route',1,TRUE,$3::text,$4::text,'FIXED',$5::jsonb,$4::text)`,
      tenant.id,
      company.id,
      branch.id,
      user.id,
      JSON.stringify({ autoFollowUp: false }),
    );
    const token = jwt.sign({
      sub: user.id,
      tenantId: tenant.id,
      membershipId: membership.id,
      roleId: role.id,
      companyId: company.id,
      branchId: branch.id,
      roleScope: 'BRANCH',
    });
    return { tenant, company, branch, user, authorization: `Bearer ${token}` };
  }

  async function createMarketingLead(
    context: Awaited<ReturnType<typeof setup>>,
    email: string,
  ) {
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_marketing_leads(
         id,tenant_id,company_id,branch_id,provider,first_name,last_name,email,status
       ) VALUES($1::text,$2::text,$3::text,$4::text,'META','Marketing','Customer',$5,'NEW')`,
      id,
      context.tenant.id,
      context.company.id,
      context.branch.id,
      email,
    );
    await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${id}/convert-to-crm`)
      .set('Authorization', context.authorization)
      .expect(201);
    return id;
  }

  it('creates one customer with declined consent records and remains idempotent', async () => {
    const context = await setup();
    const leadId = await createMarketingLead(
      context,
      `new-customer-${randomUUID()}@example.test`,
    );

    const first = await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${leadId}/convert-to-customer`)
      .set('Authorization', context.authorization)
      .expect(201);

    expect(first.body.idempotent).toBe(false);
    expect(first.body.matchedExisting).toBe(false);
    const consents = await prisma.customerConsent.findMany({
      where: { customerId: first.body.customerId },
    });
    expect(consents).toHaveLength(8);
    expect(consents.every((consent) => consent.status === 'DECLINED')).toBe(true);

    const second = await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${leadId}/convert-to-customer`)
      .set('Authorization', context.authorization)
      .expect(201);
    expect(second.body.customerId).toBe(first.body.customerId);
    expect(second.body.idempotent).toBe(true);
  });

  it('links an existing branch customer when the email matches', async () => {
    const context = await setup();
    const email = `existing-${randomUUID()}@example.test`;
    const customer = await prisma.customer.create({
      data: {
        tenantId: context.tenant.id,
        branchId: context.branch.id,
        firstName: 'Existing',
        lastName: 'Customer',
        email,
        customerSource: 'OTHER',
      },
    });
    const leadId = await createMarketingLead(context, email.toUpperCase());

    const response = await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${leadId}/convert-to-customer`)
      .set('Authorization', context.authorization)
      .expect(201);

    expect(response.body.customerId).toBe(customer.id);
    expect(response.body.matchedExisting).toBe(true);
    const customerCount = await prisma.customer.count({
      where: { tenantId: context.tenant.id, branchId: context.branch.id },
    });
    expect(customerCount).toBe(1);
  });
});
