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

describe('Corporate communications CRM follow-up SLA (e2e)', () => {
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

  async function setup() {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const tenant = await prisma.tenant.create({
      data: { name: `FollowUp ${suffix}`, slug: `followup-${suffix}` },
    });
    const company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: `FollowUp Company ${suffix}`,
        slug: `followup-company-${suffix}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: 'Merkez',
        code: `FUP-${suffix.slice(0, 7).toUpperCase()}`,
      },
    });
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        name: 'FollowUp Team',
        slug: `followup-team-${suffix}`,
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
          lastName: 'FollowUp',
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
    const owner = await addUser('Owner');
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
      owner: owner.user,
      authorization: `Bearer ${token}`,
    };
  }

  it('creates the configured first-contact task in the same CRM conversion', async () => {
    const context = await setup();
    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_lead_routing_rules(
         tenant_id,company_id,name,priority,active,target_branch_id,target_user_id,strategy,conditions,created_by_user_id
       ) VALUES($1::text,$2::text,'Fast WhatsApp',1,TRUE,$3::text,$4::text,'FIXED',$5::jsonb,$6::text)`,
      context.tenant.id,
      context.company.id,
      context.branch.id,
      context.owner.id,
      JSON.stringify({
        autoFollowUp: true,
        followUpSlaMinutes: 7,
        followUpChannel: 'WHATSAPP',
      }),
      context.actor.id,
    );

    const marketingLeadId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_marketing_leads(
         id,tenant_id,company_id,branch_id,provider,first_name,last_name,email,status
       ) VALUES($1::text,$2::text,$3::text,$4::text,'META','Sla','Lead',$5,'NEW')`,
      marketingLeadId,
      context.tenant.id,
      context.company.id,
      context.branch.id,
      `sla-${randomUUID()}@example.test`,
    );

    const before = Date.now();
    const response = await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${marketingLeadId}/convert-to-crm`)
      .set('Authorization', context.authorization)
      .expect(201);
    const after = Date.now();

    expect(response.body.followUpId).toEqual(expect.any(String));
    expect(response.body.followUpChannel).toBe('WHATSAPP');
    expect(response.body.followUpSlaMinutes).toBe(7);

    const rows = await prisma.$queryRawUnsafe<
      Array<{ assignedUserId: string; channel: string; dueAt: Date; status: string }>
    >(
      `SELECT assigned_user_id AS "assignedUserId",channel,due_at AS "dueAt",status
       FROM crm_follow_ups WHERE id=$1::text`,
      response.body.followUpId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].assignedUserId).toBe(context.owner.id);
    expect(rows[0].channel).toBe('WHATSAPP');
    expect(rows[0].status).toBe('OPEN');
    expect(rows[0].dueAt.getTime()).toBeGreaterThanOrEqual(before + 6 * 60_000);
    expect(rows[0].dueAt.getTime()).toBeLessThanOrEqual(after + 8 * 60_000);
  });

  it('does not create an automatic task when the routing policy disables it', async () => {
    const context = await setup();
    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_lead_routing_rules(
         tenant_id,company_id,name,priority,active,target_branch_id,target_user_id,strategy,conditions,created_by_user_id
       ) VALUES($1::text,$2::text,'No Auto Task',1,TRUE,$3::text,$4::text,'FIXED',$5::jsonb,$6::text)`,
      context.tenant.id,
      context.company.id,
      context.branch.id,
      context.owner.id,
      JSON.stringify({
        autoFollowUp: false,
        followUpSlaMinutes: 30,
        followUpChannel: 'CALL',
      }),
      context.actor.id,
    );

    const marketingLeadId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO corporate_marketing_leads(
         id,tenant_id,company_id,branch_id,provider,first_name,last_name,email,status
       ) VALUES($1::text,$2::text,$3::text,$4::text,'META','No','Task',$5,'NEW')`,
      marketingLeadId,
      context.tenant.id,
      context.company.id,
      context.branch.id,
      `no-task-${randomUUID()}@example.test`,
    );

    const response = await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${marketingLeadId}/convert-to-crm`)
      .set('Authorization', context.authorization)
      .expect(201);

    expect(response.body.followUpId).toBeNull();
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*)::bigint AS count FROM crm_follow_ups WHERE lead_id=$1::text`,
      response.body.crmLeadId,
    );
    expect(Number(rows[0].count)).toBe(0);
  });
});
