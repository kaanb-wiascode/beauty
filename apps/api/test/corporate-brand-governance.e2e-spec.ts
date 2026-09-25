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

describe('Corporate brand governance (e2e)', () => {
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

  it('keeps company default and branch overrides isolated and revisioned', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const tenant = await prisma.tenant.create({ data: { name: `Brand E2E ${suffix}`, slug: `brand-e2e-${suffix}` } });
    const company = await prisma.company.create({ data: { tenantId: tenant.id, name: `Brand Company ${suffix}`, slug: `brand-company-${suffix}` } });
    const branchA = await prisma.branch.create({ data: { companyId: company.id, name: 'Kadıköy', code: `BR-A-${suffix.slice(0, 6).toUpperCase()}` } });
    const branchB = await prisma.branch.create({ data: { companyId: company.id, name: 'Ataşehir', code: `BR-B-${suffix.slice(0, 6).toUpperCase()}` } });

    const permissionRead = await prisma.permission.upsert({
      where: { resource_action: { resource: 'communications', action: 'read' } },
      update: {},
      create: { resource: 'communications', action: 'read', description: 'communications read' },
    });
    const permissionManage = await prisma.permission.upsert({
      where: { resource_action: { resource: 'communications', action: 'manage' } },
      update: {},
      create: { resource: 'communications', action: 'manage', description: 'communications manage' },
    });

    async function actor(label: string, scope: 'COMPANY' | 'BRANCH', branchId: string | null) {
      const role = await prisma.role.create({
        data: { tenantId: tenant.id, companyId: company.id, name: label, slug: `${label.toLowerCase()}-${suffix}`, scope },
      });
      await prisma.rolePermission.createMany({
        data: [
          { roleId: role.id, permissionId: permissionRead.id },
          { roleId: role.id, permissionId: permissionManage.id },
        ],
      });
      const user = await prisma.user.create({
        data: { email: `${label.toLowerCase()}-${suffix}@example.test`, passwordHash: 'not-used', firstName: label, lastName: 'E2E' },
      });
      const membership = await prisma.membership.create({ data: { userId: user.id, tenantId: tenant.id, companyId: company.id, roleId: role.id } });
      if (branchId) await prisma.membershipBranchAccess.create({ data: { membershipId: membership.id, branchId } });
      const token = jwt.sign({ sub: user.id, tenantId: tenant.id, membershipId: membership.id, roleId: role.id, companyId: company.id, branchId, roleScope: scope });
      return { user, authorization: `Bearer ${token}` };
    }

    const companyManager = await actor('BrandCompanyManager', 'COMPANY', null);
    const branchManager = await actor('BrandBranchManager', 'BRANCH', branchA.id);

    const baseBody = {
      name: 'VALOO Ana Marka Politikası',
      toneOfVoice: 'Premium, açık, güven veren ve ölçülü.',
      brandPersonality: ['premium', 'modern', 'güvenilir'],
      allowedPhrases: ['kişiye özel bakım'],
      forbiddenPhrases: ['garantili sonuç'],
      hashtagRules: { required: ['#VALOO'], preferred: [], forbidden: ['#mucize'], maxCount: 8 },
      colorTokens: [{ name: 'Primary', hex: '#1674BD', usage: 'Ana vurgu' }],
      fontTokens: [{ name: 'Body', family: 'Inter', role: 'BODY', weight: '400' }],
      logoRules: { allowedBackgrounds: ['açık', 'koyu'], forbiddenUses: ['esnetme'] },
      contentRules: { requiredDisclosures: [], forbiddenClaims: ['kesin sonuç'], ctaGuidelines: 'Net ve ölçülü CTA kullan.' },
    };

    const globalCreated = await request(app.getHttpServer())
      .post('/corporate-communications/brand-governance')
      .set('Authorization', companyManager.authorization)
      .send({ ...baseBody, branchId: null })
      .expect(201);

    expect(globalCreated.body.branchId).toBeNull();
    expect(globalCreated.body.revision).toBe(1);

    const globalUpdated = await request(app.getHttpServer())
      .post('/corporate-communications/brand-governance')
      .set('Authorization', companyManager.authorization)
      .send({ ...baseBody, branchId: null, toneOfVoice: 'Premium, sıcak, açık ve güven veren.' })
      .expect(201);

    expect(globalUpdated.body.id).toBe(globalCreated.body.id);
    expect(globalUpdated.body.revision).toBe(2);

    await request(app.getHttpServer())
      .post('/corporate-communications/brand-governance')
      .set('Authorization', branchManager.authorization)
      .send({ ...baseBody, branchId: null })
      .expect(400);

    await request(app.getHttpServer())
      .post('/corporate-communications/brand-governance')
      .set('Authorization', branchManager.authorization)
      .send({ ...baseBody, branchId: branchB.id })
      .expect(400);

    const branchCreated = await request(app.getHttpServer())
      .post('/corporate-communications/brand-governance')
      .set('Authorization', branchManager.authorization)
      .send({ ...baseBody, branchId: branchA.id, name: 'Kadıköy Marka Varyantı', forbiddenPhrases: ['ucuz', 'garantili sonuç'] })
      .expect(201);

    expect(branchCreated.body.branchId).toBe(branchA.id);
    expect(branchCreated.body.revision).toBe(1);

    const branchView = await request(app.getHttpServer())
      .get('/corporate-communications/brand-governance')
      .set('Authorization', branchManager.authorization)
      .expect(200);

    expect(branchView.body.companyDefault.id).toBe(globalCreated.body.id);
    expect(branchView.body.branchOverride.id).toBe(branchCreated.body.id);
    expect(branchView.body.profiles).toHaveLength(2);

    const events = await prisma.$queryRawUnsafe<Array<{ profileId: string; revision: number; eventType: string }>>(
      `SELECT profile_id AS "profileId",revision,event_type AS "eventType"
       FROM corporate_brand_governance_events
       WHERE tenant_id=$1::text AND company_id=$2::text
       ORDER BY created_at,id`,
      tenant.id,
      company.id,
    );

    expect(events.filter((event) => event.profileId === globalCreated.body.id).map((event) => event.revision)).toEqual([1, 2]);
    expect(events.filter((event) => event.profileId === branchCreated.body.id).map((event) => event.eventType)).toEqual(['CREATED']);
  });
});
