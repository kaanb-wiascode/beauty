import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(120_000);

type Template = {
  key: string;
  name: string;
  scope: 'CENTRAL' | 'COMPANY' | 'BRANCH';
  permissions: string[];
};

type Probe = {
  permission: string;
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  body?: Record<string, unknown>;
};

describe('Role / permission matrix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const probes: Probe[] = [
    { permission: 'customers.read', method: 'get', path: '/customers?limit=1' },
    { permission: 'customers.create', method: 'post', path: '/customers', body: { firstName: 'Matrix' } },
    { permission: 'customers.update', method: 'patch', path: `/customers/${randomUUID()}`, body: { firstName: 'Matrix' } },

    { permission: 'appointments.read', method: 'get', path: '/appointments?page=1&limit=1' },
    {
      permission: 'appointments.create',
      method: 'post',
      path: '/appointments',
      body: {
        customerId: randomUUID(),
        staffId: randomUUID(),
        serviceId: randomUUID(),
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 90_000_000).toISOString(),
      },
    },
    { permission: 'appointments.update', method: 'patch', path: `/appointments/${randomUUID()}`, body: { notes: 'Matrix' } },
    { permission: 'appointments.cancel', method: 'delete', path: `/appointments/${randomUUID()}` },

    { permission: 'payments.read', method: 'get', path: '/payments?limit=1' },
    { permission: 'payments.create', method: 'post', path: '/payments', body: { appointmentId: randomUUID(), amount: 100, method: 'CARD' } },
    { permission: 'payments.refund', method: 'post', path: `/payments/${randomUUID()}/refund`, body: { reason: 'Matrix permission probe' } },

    { permission: 'reports.read', method: 'get', path: '/reports/catalog' },

    { permission: 'staff.read', method: 'get', path: '/staff?limit=1' },
    { permission: 'staff.update', method: 'patch', path: `/staff/${randomUUID()}`, body: { firstName: 'Matrix' } },

    { permission: 'services.read', method: 'get', path: '/services?limit=1' },

    { permission: 'inventory.read', method: 'get', path: '/inventory/overview' },
    { permission: 'inventory.write', method: 'post', path: '/inventory/categories', body: { name: '' } },

    { permission: 'crm.read', method: 'get', path: '/crm/leads?limit=1' },
    { permission: 'crm.manage', method: 'post', path: '/crm/leads', body: { firstName: 'Matrix', lastName: 'Lead' } },

    { permission: 'finance.read', method: 'get', path: '/finance/setup/expense-categories' },
    { permission: 'finance.manage', method: 'post', path: '/finance/setup/expense-categories', body: { code: '', name: '' } },

    { permission: 'accounting.read', method: 'get', path: '/accounting/accounts' },
    { permission: 'accounting.manage', method: 'post', path: '/accounting/accounts', body: { code: '', name: '', type: 'ASSET' } },

    { permission: 'hr.read', method: 'get', path: '/hr/employees' },
    { permission: 'hr.manage', method: 'post', path: '/hr/employees', body: { firstName: 'Matrix' } },

    { permission: 'roles.read', method: 'get', path: '/roles' },
    { permission: 'roles.update', method: 'post', path: '/roles', body: { name: 'M' } },
  ];

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

  function tokenFor(input: {
    userId: string;
    tenantId: string;
    membershipId: string;
    roleId: string;
    companyId: string;
    branchId?: string;
    roleScope: 'CENTRAL' | 'COMPANY' | 'BRANCH';
  }) {
    return jwt.sign({
      sub: input.userId,
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      roleId: input.roleId,
      companyId: input.companyId,
      branchId: input.branchId,
      roleScope: input.roleScope,
    });
  }

  async function executeProbe(token: string, probe: Probe) {
    const call = request(app.getHttpServer())[probe.method](probe.path)
      .set('Authorization', `Bearer ${token}`);
    if (probe.body) call.send(probe.body);
    return call;
  }

  it('enforces all built-in role templates against representative protected endpoints', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);

    const tenant = await prisma.tenant.create({
      data: { name: `RBAC Matrix ${suffix}`, slug: `rbac-matrix-${suffix}` },
    });
    const company = await prisma.company.create({
      data: { tenantId: tenant.id, name: `Matrix Company ${suffix}`, slug: `matrix-company-${suffix}` },
    });
    const branchA = await prisma.branch.create({
      data: { companyId: company.id, name: 'Şube A', code: `MA-${suffix.slice(0, 6).toUpperCase()}` },
    });
    const branchB = await prisma.branch.create({
      data: { companyId: company.id, name: 'Şube B', code: `MB-${suffix.slice(0, 6).toUpperCase()}` },
    });

    const adminRole = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        name: 'Matrix Administrator',
        slug: `matrix-admin-${suffix}`,
        scope: 'CENTRAL',
      },
    });

    for (const [resource, action] of [['roles', 'read'], ['roles', 'update']] as const) {
      const permission = await prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        update: {},
        create: { resource, action, description: `${resource} ${action}` },
      });
      await prisma.rolePermission.create({
        data: { roleId: adminRole.id, permissionId: permission.id },
      });
    }

    const adminUser = await prisma.user.create({
      data: {
        email: `matrix-admin-${suffix}@example.test`,
        passwordHash: 'not-used',
        firstName: 'Matrix',
        lastName: 'Admin',
      },
    });
    const adminMembership = await prisma.membership.create({
      data: {
        userId: adminUser.id,
        tenantId: tenant.id,
        companyId: company.id,
        roleId: adminRole.id,
      },
    });

    const adminToken = tokenFor({
      userId: adminUser.id,
      tenantId: tenant.id,
      membershipId: adminMembership.id,
      roleId: adminRole.id,
      companyId: company.id,
      branchId: branchA.id,
      roleScope: 'CENTRAL',
    });

    const templatesResponse = await request(app.getHttpServer())
      .get('/roles/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const templates = templatesResponse.body as Template[];
    expect(templates.map((template) => template.key).sort()).toEqual([
      'accountant',
      'auditor',
      'branch-manager',
      'finance',
      'general-manager',
      'hr',
      'reception',
      'warehouse',
    ]);

    const requiredPairs = new Map<string, { resource: string; action: string }>();
    for (const template of templates) {
      for (const value of template.permissions) {
        const [resource, action] = value.split('.');
        requiredPairs.set(value, { resource, action });
      }
    }
    for (const probe of probes) {
      const [resource, action] = probe.permission.split('.');
      requiredPairs.set(probe.permission, { resource, action });
    }
    requiredPairs.set('hr_sensitive.read', { resource: 'hr_sensitive', action: 'read' });

    for (const { resource, action } of requiredPairs.values()) {
      await prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        update: {},
        create: { resource, action, description: `${resource} ${action}` },
      });
    }

    for (const template of templates) {
      const instantiated = await request(app.getHttpServer())
        .post(`/roles/templates/${template.key}/instantiate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `${template.name} ${suffix}` })
        .expect(201);

      const roleId = instantiated.body.id as string;
      const user = await prisma.user.create({
        data: {
          email: `${template.key}-${suffix}@example.test`,
          passwordHash: 'not-used',
          firstName: template.name,
          lastName: 'Matrix',
        },
      });
      const membership = await prisma.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          companyId: company.id,
          roleId,
        },
      });

      if (template.scope !== 'CENTRAL') {
        await prisma.membershipBranchAccess.create({
          data: { membershipId: membership.id, branchId: branchA.id },
        });
      }

      const token = tokenFor({
        userId: user.id,
        tenantId: tenant.id,
        membershipId: membership.id,
        roleId,
        companyId: company.id,
        branchId: branchA.id,
        roleScope: template.scope,
      });

      const granted = new Set(template.permissions);

      for (const probe of probes) {
        const response = await executeProbe(token, probe);
        if (granted.has(probe.permission)) {
          expect({
            role: template.key,
            permission: probe.permission,
            status: response.status,
          }).not.toMatchObject({ status: 401 });
          expect({
            role: template.key,
            permission: probe.permission,
            status: response.status,
          }).not.toMatchObject({ status: 403 });
        } else {
          expect(response.status).toBe(403);
        }
      }

      const sensitive = await request(app.getHttpServer())
        .get('/hr/employees/sensitive')
        .set('Authorization', `Bearer ${token}`);

      const hasSensitive =
        granted.has('hr.read') && granted.has('hr_sensitive.read');
      if (hasSensitive) {
        expect(sensitive.status).not.toBe(401);
        expect(sensitive.status).not.toBe(403);
      } else {
        expect(sensitive.status).toBe(403);
      }

      const foreignBranchToken = tokenFor({
        userId: user.id,
        tenantId: tenant.id,
        membershipId: membership.id,
        roleId,
        companyId: company.id,
        branchId: branchB.id,
        roleScope: template.scope,
      });

      const branchScopeProbe = await request(app.getHttpServer())
        .get('/reports/catalog')
        .set('Authorization', `Bearer ${foreignBranchToken}`);

      if (!granted.has('reports.read')) {
        expect(branchScopeProbe.status).toBe(403);
      } else if (template.scope === 'CENTRAL') {
        expect(branchScopeProbe.status).not.toBe(401);
        expect(branchScopeProbe.status).not.toBe(403);
      } else {
        expect(branchScopeProbe.status).toBe(403);
      }

      if (template.scope === 'BRANCH') {
        const noBranchToken = tokenFor({
          userId: user.id,
          tenantId: tenant.id,
          membershipId: membership.id,
          roleId,
          companyId: company.id,
          roleScope: template.scope,
        });
        await request(app.getHttpServer())
          .get('/reports/catalog')
          .set('Authorization', `Bearer ${noBranchToken}`)
          .expect(401);
      }
    }
  });
});
