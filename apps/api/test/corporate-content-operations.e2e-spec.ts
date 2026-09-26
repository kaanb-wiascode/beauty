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

describe('Corporate content operations (e2e)', () => {
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

  it('separates content management from approval and enforces review before scheduling/publishing', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const tenant = await prisma.tenant.create({ data: { name: `Content E2E ${suffix}`, slug: `content-e2e-${suffix}` } });
    const company = await prisma.company.create({ data: { tenantId: tenant.id, name: `Content Company ${suffix}`, slug: `content-company-${suffix}` } });
    const branch = await prisma.branch.create({ data: { companyId: company.id, name: 'Merkez', code: `CNT-${suffix.slice(0, 8).toUpperCase()}` } });

    async function createActor(label: string, actions: string[]) {
      const role = await prisma.role.create({
        data: { tenantId: tenant.id, companyId: company.id, name: label, slug: `${label.toLowerCase().replaceAll(' ', '-')}-${suffix}`, scope: 'BRANCH' },
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
        data: { email: `${label.toLowerCase().replaceAll(' ', '-')}-${suffix}@example.test`, passwordHash: 'not-used', firstName: label, lastName: 'E2E' },
      });
      const membership = await prisma.membership.create({ data: { userId: user.id, tenantId: tenant.id, companyId: company.id, roleId: role.id } });
      await prisma.membershipBranchAccess.create({ data: { membershipId: membership.id, branchId: branch.id } });
      const token = jwt.sign({ sub: user.id, tenantId: tenant.id, membershipId: membership.id, roleId: role.id, companyId: company.id, branchId: branch.id, roleScope: 'BRANCH' });
      return { user, authorization: `Bearer ${token}` };
    }

    const manager = await createActor('Content Manager', ['read', 'manage']);
    const approver = await createActor('Content Approver', ['read', 'approve']);

    const created = await request(app.getHttpServer())
      .post('/corporate-communications/content')
      .set('Authorization', manager.authorization)
      .send({ title: `Eylül Kampanya İçeriği ${suffix}`, platform: 'INSTAGRAM', format: 'REEL', caption: 'İlk taslak', metadata: {} })
      .expect(201);

    expect(created.body.status).toBe('IDEA');

    await request(app.getHttpServer())
      .post(`/corporate-communications/content/${created.body.id}/schedule`)
      .set('Authorization', manager.authorization)
      .send({ scheduledAt: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(409);

    const review = await request(app.getHttpServer())
      .post(`/corporate-communications/content/${created.body.id}/submit-review`)
      .set('Authorization', manager.authorization)
      .expect(201);

    const repeatedReview = await request(app.getHttpServer())
      .post(`/corporate-communications/content/${created.body.id}/submit-review`)
      .set('Authorization', manager.authorization)
      .expect(201);

    expect(repeatedReview.body.idempotent).toBe(true);
    expect(repeatedReview.body.approvalId).toBe(review.body.approvalId);

    await request(app.getHttpServer())
      .post(`/corporate-communications/approvals/${review.body.approvalId}/approve`)
      .set('Authorization', manager.authorization)
      .send({ note: 'Manager kendi onay yetkisine sahip değil.' })
      .expect(403);

    const approved = await request(app.getHttpServer())
      .post(`/corporate-communications/approvals/${review.body.approvalId}/approve`)
      .set('Authorization', approver.authorization)
      .send({ note: 'İçerik marka ve kampanya kriterlerine uygun.' })
      .expect(201);

    expect(approved.body.contentStatus).toBe('APPROVED');

    await request(app.getHttpServer())
      .post(`/corporate-communications/content/${created.body.id}/schedule`)
      .set('Authorization', approver.authorization)
      .send({ scheduledAt: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(403);

    const scheduledAt = new Date(Date.now() + 86_400_000);
    const scheduled = await request(app.getHttpServer())
      .post(`/corporate-communications/content/${created.body.id}/schedule`)
      .set('Authorization', manager.authorization)
      .send({ scheduledAt: scheduledAt.toISOString() })
      .expect(201);

    expect(scheduled.body.status).toBe('SCHEDULED');

    const published = await request(app.getHttpServer())
      .post(`/corporate-communications/content/${created.body.id}/publish`)
      .set('Authorization', manager.authorization)
      .send({})
      .expect(201);

    expect(published.body.status).toBe('PUBLISHED');

    const approvals = await request(app.getHttpServer())
      .get('/corporate-communications/approvals?status=APPROVED')
      .set('Authorization', approver.authorization)
      .expect(200);

    expect(approvals.body.some((item: { id: string }) => item.id === review.body.approvalId)).toBe(true);
  });
});
