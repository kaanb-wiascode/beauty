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

describe('Corporate marketing vendors (e2e)', () => {
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

  afterAll(async () => {
    await app.close();
  });

  it('governs vendor mutations, branch scope and system-owned revenue', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const tenant = await prisma.tenant.create({ data: { name: `Vendor ${suffix}`, slug: `vendor-${suffix}` } });
    const company = await prisma.company.create({ data: { tenantId: tenant.id, name: `Vendor Co ${suffix}`, slug: `vendor-co-${suffix}` } });
    const branchA = await prisma.branch.create({ data: { companyId: company.id, name: 'A', code: `VA-${suffix.slice(0, 6)}` } });
    const branchB = await prisma.branch.create({ data: { companyId: company.id, name: 'B', code: `VB-${suffix.slice(0, 6)}` } });

    const manager = await createActor('manager', ['read', 'manage'], branchA.id);
    const reader = await createActor('reader', ['read'], branchA.id);

    const created = await request(app.getHttpServer())
      .post('/corporate-communications/vendors')
      .set('Authorization', manager.authorization)
      .send({
        name: `Growth Agency ${suffix}`,
        vendorType: 'AD_AGENCY',
        branchId: branchA.id,
        contactName: 'Ajans Yetkilisi',
        contactEmail: `agency-${suffix}@example.test`,
        serviceScope: 'Meta Ads, Google Ads ve creative optimizasyonu',
        monthlyFee: 45000,
        currency: 'TRY',
        paymentModel: 'MONTHLY_RETAINER',
        kpiCommitments: { targetRoas: 4, maxCpl: 250 },
        attributedRevenue: 999999,
      })
      .expect(201);

    expect(created.body.name).toContain('Growth Agency');
    expect(Number(created.body.monthlyFee)).toBe(45000);
    expect(Number(created.body.attributedRevenue)).toBe(0);

    const listed = await request(app.getHttpServer())
      .get('/corporate-communications/vendors?limit=20')
      .set('Authorization', reader.authorization)
      .expect(200);
    expect(listed.body.some((item: { id: string }) => item.id === created.body.id)).toBe(true);

    await request(app.getHttpServer())
      .post('/corporate-communications/vendors')
      .set('Authorization', reader.authorization)
      .send({ name: 'Denied', vendorType: 'FREELANCER' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/corporate-communications/vendors/${created.body.id}`)
      .set('Authorization', reader.authorization)
      .send({ status: 'PAUSED' })
      .expect(403);

    const updated = await request(app.getHttpServer())
      .patch(`/corporate-communications/vendors/${created.body.id}`)
      .set('Authorization', manager.authorization)
      .send({
        status: 'PAUSED',
        performanceNotes: 'Aylık performans değerlendirmesi bekleniyor.',
        monthlyFee: 47500,
        attributedRevenue: 123456,
      })
      .expect(200);
    expect(updated.body.status).toBe('PAUSED');
    expect(Number(updated.body.monthlyFee)).toBe(47500);
    expect(Number(updated.body.attributedRevenue)).toBe(0);

    const managerB = await createActor('manager-b', ['read', 'manage'], branchB.id);
    const branchBList = await request(app.getHttpServer())
      .get('/corporate-communications/vendors?limit=20')
      .set('Authorization', managerB.authorization)
      .expect(200);
    expect(branchBList.body.some((item: { id: string }) => item.id === created.body.id)).toBe(false);

    await request(app.getHttpServer())
      .patch(`/corporate-communications/vendors/${created.body.id}`)
      .set('Authorization', managerB.authorization)
      .send({ status: 'ACTIVE' })
      .expect(404);

    async function createActor(label: string, actions: readonly string[], branchId: string) {
      const role = await prisma.role.create({
        data: { tenantId: tenant.id, companyId: company.id, name: `Vendor ${label}`, slug: `vendor-${label}-${suffix}`, scope: 'BRANCH' },
      });
      for (const action of actions) {
        const permission = await prisma.permission.upsert({
          where: { resource_action: { resource: 'communications', action } },
          update: {},
          create: { resource: 'communications', action, description: `communications ${action}` },
        });
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      }
      const user = await prisma.user.create({
        data: { email: `vendor-${label}-${suffix}@example.test`, passwordHash: 'not-used', firstName: 'Vendor', lastName: label },
      });
      const membership = await prisma.membership.create({
        data: { userId: user.id, tenantId: tenant.id, companyId: company.id, roleId: role.id },
      });
      await prisma.membershipBranchAccess.create({ data: { membershipId: membership.id, branchId } });
      const token = jwt.sign({
        sub: user.id,
        tenantId: tenant.id,
        membershipId: membership.id,
        roleId: role.id,
        companyId: company.id,
        branchId,
        roleScope: 'BRANCH',
      });
      return { authorization: `Bearer ${token}` };
    }
  });
});
