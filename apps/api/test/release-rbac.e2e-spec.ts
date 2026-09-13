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

describe('Release RBAC denials (e2e)', () => {
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

  it('allows read access but denies payment, accounting and payroll mutations without manage permissions', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);

    const tenant = await prisma.tenant.create({
      data: {
        name: `RBAC E2E ${suffix}`,
        slug: `rbac-e2e-${suffix}`,
      },
    });

    const company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: `RBAC Company ${suffix}`,
        slug: `rbac-company-${suffix}`,
      },
    });

    const branch = await prisma.branch.create({
      data: {
        companyId: company.id,
        name: 'Merkez',
        code: `RBAC-${suffix.slice(0, 8).toUpperCase()}`,
      },
    });

    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        companyId: company.id,
        name: 'Release Read Only',
        slug: `release-read-only-${suffix}`,
        scope: 'BRANCH',
      },
    });

    const readPermissions = [
      ['payments', 'read'],
      ['accounting', 'read'],
      ['hr', 'read'],
    ] as const;

    for (const [resource, action] of readPermissions) {
      const permission = await prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        update: {},
        create: {
          resource,
          action,
          description: `${resource} ${action} permission`,
        },
      });

      await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }

    const user = await prisma.user.create({
      data: {
        email: `rbac-${suffix}@example.test`,
        passwordHash: 'not-used-in-token-based-rbac-test',
        firstName: 'Read',
        lastName: 'Only',
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
      data: {
        membershipId: membership.id,
        branchId: branch.id,
      },
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

    const authorization = `Bearer ${token}`;

    await request(app.getHttpServer())
      .get('/payments?limit=10')
      .set('Authorization', authorization)
      .expect(200);

    await request(app.getHttpServer())
      .get('/accounting/accounts')
      .set('Authorization', authorization)
      .expect(200);

    await request(app.getHttpServer())
      .get('/hr/payroll/dashboard')
      .set('Authorization', authorization)
      .expect(200);

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', authorization)
      .send({
        appointmentId: randomUUID(),
        amount: 100,
        method: 'CARD',
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/payments/${randomUUID()}/refund`)
      .set('Authorization', authorization)
      .send({ reason: 'RBAC denial check' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/accounting/accounts')
      .set('Authorization', authorization)
      .send({
        code: '999',
        name: 'Denied Account',
        type: 'ASSET',
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/accounting/journal-entries')
      .set('Authorization', authorization)
      .send({
        entryDate: new Date().toISOString(),
        description: 'Denied Journal',
        lines: [
          { accountId: randomUUID(), debit: 100, credit: 0 },
          { accountId: randomUUID(), debit: 0, credit: 100 },
        ],
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/hr/payroll/periods')
      .set('Authorization', authorization)
      .send({ year: 2026, month: 9 })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/hr/payroll/payments/${randomUUID()}/reverse`)
      .set('Authorization', authorization)
      .send({ reason: 'RBAC denial check' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/sales/from-opportunity/${randomUUID()}`)
      .set('Authorization', authorization)
      .send({
        version: 1,
        discountTotal: 0,
        items: [{ type: 'SERVICE', referenceId: randomUUID(), quantity: 1 }],
      })
      .expect(403);
  });
});
