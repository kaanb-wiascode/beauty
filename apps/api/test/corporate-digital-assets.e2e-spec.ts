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

describe('Corporate digital assets (e2e)', () => {
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

  it('keeps checksum idempotency, license states and branch mutation scope', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const tenant = await prisma.tenant.create({ data: { name: `Asset E2E ${suffix}`, slug: `asset-e2e-${suffix}` } });
    const company = await prisma.company.create({ data: { tenantId: tenant.id, name: `Asset Company ${suffix}`, slug: `asset-company-${suffix}` } });
    const branch = await prisma.branch.create({ data: { companyId: company.id, name: 'Kadıköy', code: `AST-${suffix.slice(0, 8).toUpperCase()}` } });

    const read = await prisma.permission.upsert({ where: { resource_action: { resource: 'communications', action: 'read' } }, update: {}, create: { resource: 'communications', action: 'read', description: 'communications read' } });
    const manage = await prisma.permission.upsert({ where: { resource_action: { resource: 'communications', action: 'manage' } }, update: {}, create: { resource: 'communications', action: 'manage', description: 'communications manage' } });

    async function actor(label: string, scope: 'COMPANY' | 'BRANCH', branchId: string | null) {
      const role = await prisma.role.create({ data: { tenantId: tenant.id, companyId: company.id, name: label, slug: `${label.toLowerCase()}-${suffix}`, scope } });
      await prisma.rolePermission.createMany({ data: [{ roleId: role.id, permissionId: read.id }, { roleId: role.id, permissionId: manage.id }] });
      const user = await prisma.user.create({ data: { email: `${label.toLowerCase()}-${suffix}@example.test`, passwordHash: 'not-used', firstName: label, lastName: 'E2E' } });
      const membership = await prisma.membership.create({ data: { userId: user.id, tenantId: tenant.id, companyId: company.id, roleId: role.id } });
      if (branchId) await prisma.membershipBranchAccess.create({ data: { membershipId: membership.id, branchId } });
      const token = jwt.sign({ sub: user.id, tenantId: tenant.id, membershipId: membership.id, roleId: role.id, companyId: company.id, branchId, roleScope: scope });
      return { authorization: `Bearer ${token}` };
    }

    const companyManager = await actor('AssetCompanyManager', 'COMPANY', null);
    const branchManager = await actor('AssetBranchManager', 'BRANCH', branch.id);
    const globalChecksum = 'a'.repeat(64);

    const globalCreated = await request(app.getHttpServer())
      .post('/corporate-communications/digital-assets')
      .set('Authorization', companyManager.authorization)
      .send({
        name: 'VALOO Global Logo', assetType: 'LOGO', externalUrl: 'https://example.test/logo.svg',
        mimeType: 'image/svg+xml', checksumSha256: globalChecksum, rightsOwner: 'VALOO', tags: ['logo', 'global'],
        licenseExpiresAt: null,
      })
      .expect(201);

    expect(globalCreated.body.idempotent).toBe(false);
    expect(globalCreated.body.asset.branchId).toBeNull();

    const repeated = await request(app.getHttpServer())
      .post('/corporate-communications/digital-assets')
      .set('Authorization', companyManager.authorization)
      .send({ name: 'Duplicate Logo', assetType: 'LOGO', externalUrl: 'https://example.test/logo-copy.svg', checksumSha256: globalChecksum })
      .expect(201);

    expect(repeated.body.idempotent).toBe(true);
    expect(repeated.body.asset.id).toBe(globalCreated.body.asset.id);

    const branchAsset = await request(app.getHttpServer())
      .post('/corporate-communications/digital-assets')
      .set('Authorization', branchManager.authorization)
      .send({
        name: 'Kadıköy Sonbahar Fotoğrafı', assetType: 'PHOTO', externalUrl: 'https://example.test/kadikoy.jpg',
        mimeType: 'image/jpeg', fileSizeBytes: 2048, widthPx: 1200, heightPx: 1500,
        checksumSha256: 'b'.repeat(64), rightsOwner: 'Ajans A', tags: ['kadikoy', 'campaign'],
        licenseExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .expect(201);

    expect(branchAsset.body.asset.branchId).toBe(branch.id);

    const branchView = await request(app.getHttpServer())
      .get('/corporate-communications/digital-assets')
      .set('Authorization', branchManager.authorization)
      .expect(200);

    expect(branchView.body.some((asset: { id: string }) => asset.id === globalCreated.body.asset.id)).toBe(true);
    const listedBranchAsset = branchView.body.find((asset: { id: string }) => asset.id === branchAsset.body.asset.id);
    expect(listedBranchAsset.licenseState).toBe('EXPIRING');
    expect(String(listedBranchAsset.fileSizeBytes)).toBe('2048');

    await request(app.getHttpServer())
      .post(`/corporate-communications/digital-assets/${globalCreated.body.asset.id}/archive`)
      .set('Authorization', branchManager.authorization)
      .expect(404);

    const archived = await request(app.getHttpServer())
      .post(`/corporate-communications/digital-assets/${branchAsset.body.asset.id}/archive`)
      .set('Authorization', branchManager.authorization)
      .expect(201);

    expect(archived.body.idempotent).toBe(false);

    const archivedAgain = await request(app.getHttpServer())
      .post(`/corporate-communications/digital-assets/${branchAsset.body.asset.id}/archive`)
      .set('Authorization', branchManager.authorization)
      .expect(201);

    expect(archivedAgain.body.idempotent).toBe(true);

    const events = await prisma.$queryRawUnsafe<Array<{ eventType: string }>>(
      `SELECT event_type AS "eventType" FROM corporate_digital_asset_events
       WHERE tenant_id=$1::text AND company_id=$2::text AND asset_id=$3::text ORDER BY created_at,id`,
      tenant.id,
      company.id,
      branchAsset.body.asset.id,
    );
    expect(events.map((event) => event.eventType)).toEqual(['CREATED', 'ARCHIVED']);
  });
});
