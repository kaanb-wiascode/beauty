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

describe('Corporate communications CRM bridge (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

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
    jwt = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createContext() {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const tenant = await prisma.tenant.create({
      data: { name: `Comm ${suffix}`, slug: `comm-${suffix}` },
    });
    const company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: `Comm Company ${suffix}`,
        slug: `comm-company-${suffix}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: 'Merkez',
        code: `COM-${suffix.slice(0, 7).toUpperCase()}`,
      },
    });
    const otherBranch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: 'Diğer',
        code: `OTH-${suffix.slice(0, 7).toUpperCase()}`,
      },
    });
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        name: 'Communication Manager',
        slug: `communication-manager-${suffix}`,
        scope: 'BRANCH',
      },
    });
    const permission = await prisma.permission.upsert({
      where: {
        resource_action: { resource: 'communications', action: 'manage' },
      },
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
        email: `communications-${suffix}@example.test`,
        passwordHash: 'not-used',
        firstName: 'Comm',
        lastName: 'Manager',
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

    const token = jwt.sign({
      sub: user.id,
      tenantId: tenant.id,
      membershipId: membership.id,
      roleId: role.id,
      companyId: company.id,
      branchId: branch.id,
      roleScope: 'BRANCH',
    });

    return {
      tenant,
      company,
      branch,
      otherBranch,
      user,
      authorization: `Bearer ${token}`,
    };
  }

  it('converts a routed marketing lead once and returns the same CRM lead on retry', async () => {
    const context = await createContext();

    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_lead_routing_rules(
         tenant_id,company_id,name,priority,active,target_branch_id,target_user_id,strategy,conditions,created_by_user_id
       ) VALUES($1::text,$2::text,'Fixed CRM route',1,TRUE,$3::text,$4::text,'FIXED','{}'::jsonb,$4::text)`,
      context.tenant.id,
      context.company.id,
      context.branch.id,
      context.user.id,
    );

    const marketingLeadId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_marketing_leads(
         id,tenant_id,company_id,branch_id,provider,first_name,last_name,phone,status
       ) VALUES($1::text,$2::text,$3::text,$4::text,'META','Ada','Yılmaz','5550000000','NEW')`,
      marketingLeadId,
      context.tenant.id,
      context.company.id,
      context.branch.id,
    );

    const first = await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${marketingLeadId}/convert-to-crm`)
      .set('Authorization', context.authorization)
      .expect(201);

    expect(first.body.idempotent).toBe(false);
    expect(first.body.branchId).toBe(context.branch.id);
    expect(first.body.ownerUserId).toBe(context.user.id);
    expect(first.body.crmLeadId).toEqual(expect.any(String));

    const second = await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${marketingLeadId}/convert-to-crm`)
      .set('Authorization', context.authorization)
      .expect(201);

    expect(second.body).toEqual({
      crmLeadId: first.body.crmLeadId,
      idempotent: true,
    });

    const crmLeadCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*)::bigint AS count FROM crm_leads WHERE id=$1::text`,
      first.body.crmLeadId,
    );
    expect(Number(crmLeadCount[0]?.count ?? 0)).toBe(1);

    const marketingLead = await prisma.$queryRawUnsafe<
      Array<{ crmLeadId: string | null; status: string }>
    >(
      `SELECT crm_lead_id AS "crmLeadId",status
       FROM corporate_marketing_leads WHERE id=$1::text`,
      marketingLeadId,
    );
    expect(marketingLead[0]).toEqual({
      crmLeadId: first.body.crmLeadId,
      status: 'IN_CRM',
    });
  });

  it('rejects a routing rule that resolves outside the active branch', async () => {
    const context = await createContext();

    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_lead_routing_rules(
         tenant_id,company_id,name,priority,active,target_branch_id,strategy,conditions,created_by_user_id
       ) VALUES($1::text,$2::text,'Cross branch route',1,TRUE,$3::text,'FIXED','{}'::jsonb,$4::text)`,
      context.tenant.id,
      context.company.id,
      context.otherBranch.id,
      context.user.id,
    );

    const marketingLeadId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_marketing_leads(
         id,tenant_id,company_id,branch_id,provider,first_name,last_name,email,status
       ) VALUES($1::text,$2::text,$3::text,$4::text,'GOOGLE_ADS','Ece','Kaya','ece@example.test','NEW')`,
      marketingLeadId,
      context.tenant.id,
      context.company.id,
      context.branch.id,
    );

    await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${marketingLeadId}/convert-to-crm`)
      .set('Authorization', context.authorization)
      .expect(400);

    const linked = await prisma.$queryRawUnsafe<Array<{ crmLeadId: string | null }>>(
      `SELECT crm_lead_id AS "crmLeadId" FROM corporate_marketing_leads WHERE id=$1::text`,
      marketingLeadId,
    );
    expect(linked[0]?.crmLeadId).toBeNull();
  });
});
