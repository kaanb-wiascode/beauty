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

describe('Corporate communications appointment bridge (e2e)', () => {
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
      data: { name: `Marketing Appointment ${suffix}`, slug: `mkt-appt-${suffix}` },
    });
    const company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: `Marketing Appointment Company ${suffix}`,
        slug: `mkt-appt-company-${suffix}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: 'Merkez',
        code: `MAP-${suffix.slice(0, 7).toUpperCase()}`,
      },
    });

    async function makeRole(name: string, withAppointmentCreate: boolean) {
      const role = await prisma.role.create({
        data: {
          tenantId: tenant.id,
          companyId: company.id,
          name,
          slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${suffix}`,
          scope: 'BRANCH',
        },
      });
      const communicationPermission = await prisma.permission.upsert({
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
        data: { roleId: role.id, permissionId: communicationPermission.id },
      });
      if (withAppointmentCreate) {
        const appointmentPermission = await prisma.permission.upsert({
          where: {
            resource_action: { resource: 'appointments', action: 'create' },
          },
          update: {},
          create: {
            resource: 'appointments',
            action: 'create',
            description: 'appointments create permission',
          },
        });
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: appointmentPermission.id },
        });
      }
      return role;
    }

    async function addUser(label: string, withAppointmentCreate: boolean) {
      const role = await makeRole(`${label} Role`, withAppointmentCreate);
      const user = await prisma.user.create({
        data: {
          email: `${label.toLowerCase()}-${suffix}@example.test`,
          passwordHash: 'not-used',
          firstName: label,
          lastName: 'Marketing',
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
      return { user, authorization: `Bearer ${token}` };
    }

    const allowed = await addUser('Allowed', true);
    const denied = await addUser('Denied', false);
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
    const staff = await prisma.staff.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        firstName: 'Appointment',
        lastName: 'Staff',
      },
    });
    const service = await prisma.service.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        name: `Marketing Service ${suffix}`,
        durationMinutes: 60,
        price: 1500,
      },
    });

    async function addMarketingLead(label: string) {
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO corporate_marketing_leads(
           id,tenant_id,company_id,branch_id,provider,first_name,last_name,email,status,customer_id
         ) VALUES($1::text,$2::text,$3::text,$4::text,'META',$5,'Appointment',$6,'IN_CRM',$7::text)`,
        id,
        tenant.id,
        company.id,
        branch.id,
        label,
        `${label.toLowerCase()}-${suffix}@example.test`,
        customer.id,
      );
      return id;
    }

    return {
      tenant,
      company,
      branch,
      allowed,
      denied,
      customer,
      staff,
      service,
      addMarketingLead,
    };
  }

  it('creates one appointment and returns it idempotently on repeat', async () => {
    const context = await setupContext();
    const marketingLeadId = await context.addMarketingLead('Primary');
    const startAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(9, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    const body = {
      staffId: context.staff.id,
      serviceId: context.service.id,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      notes: 'Marketing lead appointment',
    };

    const first = await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${marketingLeadId}/create-appointment`)
      .set('Authorization', context.allowed.authorization)
      .send(body)
      .expect(201);

    expect(first.body.idempotent).toBe(false);
    expect(first.body.customerId).toBe(context.customer.id);
    expect(first.body.staffId).toBe(context.staff.id);
    expect(first.body.serviceId).toBe(context.service.id);

    const repeat = await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${marketingLeadId}/create-appointment`)
      .set('Authorization', context.allowed.authorization)
      .send(body)
      .expect(201);

    expect(repeat.body.idempotent).toBe(true);
    expect(repeat.body.appointmentId).toBe(first.body.id);

    const rows = await prisma.$queryRawUnsafe<
      Array<{ appointmentId: string | null; status: string }>
    >(
      `SELECT appointment_id AS "appointmentId",status
       FROM corporate_marketing_leads WHERE id=$1::text`,
      marketingLeadId,
    );
    expect(rows[0]?.appointmentId).toBe(first.body.id);
    expect(rows[0]?.status).toBe('APPOINTMENT');
  });

  it('rejects an overlapping appointment for the same staff member', async () => {
    const context = await setupContext();
    const firstLead = await context.addMarketingLead('OverlapA');
    const secondLead = await context.addMarketingLead('OverlapB');
    const startAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(10, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    const body = {
      staffId: context.staff.id,
      serviceId: context.service.id,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    };

    await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${firstLead}/create-appointment`)
      .set('Authorization', context.allowed.authorization)
      .send(body)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${secondLead}/create-appointment`)
      .set('Authorization', context.allowed.authorization)
      .send(body)
      .expect(409);
  });

  it('requires appointments.create even when communications.manage is granted', async () => {
    const context = await setupContext();
    const marketingLeadId = await context.addMarketingLead('Denied');
    const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(11, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    await request(app.getHttpServer())
      .post(`/corporate-communications/leads/${marketingLeadId}/create-appointment`)
      .set('Authorization', context.denied.authorization)
      .send({
        staffId: context.staff.id,
        serviceId: context.service.id,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      })
      .expect(403);
  });
});
