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

describe('Corporate communications dynamic routing (e2e)', () => {
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

  async function setupContext() {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const tenant = await prisma.tenant.create({
      data: { name: `Routing ${suffix}`, slug: `routing-${suffix}` },
    });
    const company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: `Routing Company ${suffix}`,
        slug: `routing-company-${suffix}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: 'Merkez',
        code: `RTE-${suffix.slice(0, 7).toUpperCase()}`,
      },
    });
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        name: 'Routing Team',
        slug: `routing-team-${suffix}`,
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

    async function addUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${suffix}@example.test`,
          passwordHash: 'not-used',
          firstName: label,
          lastName: 'Routing',
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
      return { user, membership };
    }

    const actor = await addUser('Actor');
    const candidateA = await addUser('CandidateA');
    const candidateB = await addUser('CandidateB');
    const token = jwt.sign({
      sub: actor.user.id,
      tenantId: tenant.id,
      membershipId: actor.membership.id,
      roleId: role.id,
      companyId: company.id,
      branchId: branch.id,
      roleScope: 'BRANCH',
    });

    return {
      tenant,
      company,
      branch,
      actor: actor.user,
      candidateA: candidateA.user,
      candidateB: candidateB.user,
      authorization: `Bearer ${token}`,
    };
  }

  async function addMarketingLead(
    context: Awaited<ReturnType<typeof setupContext>>,
    firstName: string,
    assignedUserId?: string,
    status = 'NEW',
  ) {
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_marketing_leads(
         id,tenant_id,company_id,branch_id,provider,first_name,last_name,email,status,assigned_user_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,'META',$5,'Routing',$6,$7,$8::text)`,
      id,
      context.tenant.id,
      context.company.id,
      context.branch.id,
      firstName,
      `${firstName.toLowerCase()}@example.test`,
      status,
      assignedUserId ?? null,
    );
    return id;
  }

  async function addOpenCrmLead(
    context: Awaited<ReturnType<typeof setupContext>>,
    ownerUserId: string,
    index: number,
  ) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO crm_leads(
         tenant_id,company_id,branch_id,owner_user_id,first_name,last_name,email,source,status,created_by_user_id
       ) VALUES($1::text,$2::text,$3::text,$4::text,$5,'Load',$6,'TEST','NEW',$7::text)`,
      context.tenant.id,
      context.company.id,
      context.branch.id,
      ownerUserId,
      `Open${index}`,
      `open-${index}-${randomUUID()}@example.test`,
      context.actor.id,
    );
  }

  it('routes LEAST_LOADED to the eligible user with the fewest open CRM leads', async () => {
    const context = await setupContext();
    await addOpenCrmLead(context, context.actor.id, 1);
    await addOpenCrmLead(context, context.candidateA.id, 2);

    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_lead_routing_rules(
         tenant_id,company_id,name,priority,active,target_branch_id,strategy,conditions,created_by_user_id
       ) VALUES($1::text,$2::text,'Least loaded',1,TRUE,$3::text,'LEAST_LOADED','{}'::jsonb,$4::text)`,
      context.tenant.id,
      context.company.id,
      context.branch.id,
      context.actor.id,
    );

    const marketingLeadId = await addMarketingLead(context, 'LeastLoaded');
    const response = await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${marketingLeadId}/convert-to-crm`)
      .set('Authorization', context.authorization)
      .expect(201);

    expect(response.body.routingStrategy).toBe('LEAST_LOADED');
    expect(response.body.ownerUserId).toBe(context.candidateB.id);
  });

  it('routes ROUND_ROBIN to the eligible user with the fewest prior routed leads', async () => {
    const context = await setupContext();
    await addMarketingLead(context, 'PreviousActor', context.actor.id, 'IN_CRM');
    await addMarketingLead(
      context,
      'PreviousCandidateA',
      context.candidateA.id,
      'IN_CRM',
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_lead_routing_rules(
         tenant_id,company_id,name,priority,active,target_branch_id,strategy,conditions,created_by_user_id
       ) VALUES($1::text,$2::text,'Round robin',1,TRUE,$3::text,'ROUND_ROBIN','{}'::jsonb,$4::text)`,
      context.tenant.id,
      context.company.id,
      context.branch.id,
      context.actor.id,
    );

    const marketingLeadId = await addMarketingLead(context, 'RoundRobin');
    const response = await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${marketingLeadId}/convert-to-crm`)
      .set('Authorization', context.authorization)
      .expect(201);

    expect(response.body.routingStrategy).toBe('ROUND_ROBIN');
    expect(response.body.ownerUserId).toBe(context.candidateB.id);
  });
});
