import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(60_000);

describe('Inventory Asset Scope (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('isolates asset maintenance by active branch while central context sees all', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `inventory-assets-${suffix}@example.test`;
    const password = 'E2eStrongPassword!2026';

    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'Asset',
        lastName: 'Owner',
        tenantName: `Asset E2E ${suffix}`,
        tenantSlug: `asset-e2e-${suffix}`,
      })
      .expect(201);

    const branchAId = register.body.branch.id as string;
    const companyId = register.body.company.id as string;
    const membershipId = register.body.membership.id as string;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const centralToken = login.body.accessToken as string;

    const branchAContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId: branchAId })
      .expect(201);

    const branchAToken = branchAContext.body.accessToken as string;

    const assetA = await request(app.getHttpServer())
      .post('/inventory/assets')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({
        assetCode: `A-${suffix}`,
        name: `Şube A Cihazı ${suffix}`,
        assetType: 'EQUIPMENT',
        condition: 'GOOD',
      })
      .expect(201);

    const maintenanceA = await request(app.getHttpServer())
      .post('/inventory/assets/maintenance')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({
        assetId: assetA.body.id,
        type: 'PREVENTIVE',
        status: 'PLANNED',
        description: 'Şube A Periyodik Bakım',
      })
      .expect(201);

    const branchB = await prisma.branch.create({
      data: {
        companyId,
        name: `Asset E2E İkinci Şube ${suffix}`,
        code: `AST-${suffix.slice(0, 8).toUpperCase()}`,
      },
      select: { id: true },
    });

    const branchBContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId: branchB.id })
      .expect(201);

    const branchBToken = branchBContext.body.accessToken as string;

    const assetB = await request(app.getHttpServer())
      .post('/inventory/assets')
      .set('Authorization', `Bearer ${branchBToken}`)
      .send({
        assetCode: `B-${suffix}`,
        name: `Şube B Cihazı ${suffix}`,
        assetType: 'EQUIPMENT',
        condition: 'GOOD',
      })
      .expect(201);

    const maintenanceB = await request(app.getHttpServer())
      .post('/inventory/assets/maintenance')
      .set('Authorization', `Bearer ${branchBToken}`)
      .send({
        assetId: assetB.body.id,
        type: 'PREVENTIVE',
        status: 'PLANNED',
        description: 'Şube B Periyodik Bakım',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/inventory/assets/maintenance')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({
        assetId: assetB.body.id,
        type: 'PREVENTIVE',
        status: 'PLANNED',
        description: 'Çapraz Şube Bakımı Engellenmeli',
      })
      .expect(404);

    const branchAMaintenance = await request(app.getHttpServer())
      .get('/inventory/assets/maintenance')
      .set('Authorization', `Bearer ${branchAToken}`)
      .expect(200);

    const branchAMaintenanceIds = branchAMaintenance.body.map(
      (row: { id: string }) => row.id,
    );
    expect(branchAMaintenanceIds).toContain(maintenanceA.body.id);
    expect(branchAMaintenanceIds).not.toContain(maintenanceB.body.id);

    const branchBMaintenance = await request(app.getHttpServer())
      .get('/inventory/assets/maintenance')
      .set('Authorization', `Bearer ${branchBToken}`)
      .expect(200);

    const branchBMaintenanceIds = branchBMaintenance.body.map(
      (row: { id: string }) => row.id,
    );
    expect(branchBMaintenanceIds).toContain(maintenanceB.body.id);
    expect(branchBMaintenanceIds).not.toContain(maintenanceA.body.id);

    const allBranchesContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId: null })
      .expect(201);

    const allBranchesToken = allBranchesContext.body.accessToken as string;

    const allMaintenance = await request(app.getHttpServer())
      .get('/inventory/assets/maintenance')
      .set('Authorization', `Bearer ${allBranchesToken}`)
      .expect(200);

    const allMaintenanceIds = allMaintenance.body.map(
      (row: { id: string }) => row.id,
    );
    expect(allMaintenanceIds).toEqual(
      expect.arrayContaining([maintenanceA.body.id, maintenanceB.body.id]),
    );
  });
});
