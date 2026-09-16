import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(90_000);

describe('Inventory Overview Branch Scope (e2e)', () => {
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

  it('scopes warehouses, lots and expiry metrics to the active branch', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const email = `inventory-overview-${suffix}@example.test`;
    const password = 'E2eStrongPassword!2026';

    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'Inventory',
        lastName: 'Owner',
        tenantName: `Inventory Overview ${suffix}`,
        tenantSlug: `inventory-overview-${suffix}`,
      })
      .expect(201);

    const companyId = register.body.company.id as string;
    const branchAId = register.body.branch.id as string;
    const membershipId = register.body.membership.id as string;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const centralToken = login.body.accessToken as string;

    const branchB = await prisma.branch.create({
      data: {
        companyId,
        name: `İkinci Şube ${suffix}`,
        code: `INV-${suffix.slice(0, 8).toUpperCase()}`,
      },
      select: { id: true },
    });

    const branchAContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId: branchAId })
      .expect(201);

    const branchAToken = branchAContext.body.accessToken as string;
    const branchAOverview = await request(app.getHttpServer())
      .get('/inventory/overview')
      .set('Authorization', `Bearer ${branchAToken}`)
      .expect(200);

    expect(branchAOverview.body.warehouses).toHaveLength(1);
    expect(branchAOverview.body.warehouses[0].branchId).toBe(branchAId);
    const branchAWarehouse = branchAOverview.body.warehouses[0] as {
      id: string;
      branchId: string;
    };

    const productA = await request(app.getHttpServer())
      .post('/inventory/products')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({
        name: `Şube A Lot Ürünü ${suffix}`,
        unit: 'UNIT',
        warehouseId: branchAWarehouse.id,
        initialQuantity: 1,
        trackExpiry: true,
      })
      .expect(201);

    const branchBContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId: branchB.id })
      .expect(201);

    const branchBToken = branchBContext.body.accessToken as string;
    const branchBOverview = await request(app.getHttpServer())
      .get('/inventory/overview')
      .set('Authorization', `Bearer ${branchBToken}`)
      .expect(200);

    expect(branchBOverview.body.warehouses).toHaveLength(1);
    expect(branchBOverview.body.warehouses[0].branchId).toBe(branchB.id);
    const branchBWarehouse = branchBOverview.body.warehouses[0] as {
      id: string;
      branchId: string;
    };

    const productB = await request(app.getHttpServer())
      .post('/inventory/products')
      .set('Authorization', `Bearer ${branchBToken}`)
      .send({
        name: `Şube B Lot Ürünü ${suffix}`,
        unit: 'UNIT',
        warehouseId: branchBWarehouse.id,
        initialQuantity: 1,
        trackExpiry: true,
      })
      .expect(201);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const lotAPayload = {
      productId: productA.body.id,
      warehouseId: branchAWarehouse.id,
      lotNumber: `LOT-A-${suffix}`,
      expiresAt: expiresAt.toISOString(),
      quantity: 2,
      unitCost: 25,
      note: 'E2E Şube A Lot Girişi',
    };

    const lotA = await request(app.getHttpServer())
      .post('/inventory/lots')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send(lotAPayload)
      .expect(201);

    await request(app.getHttpServer())
      .post('/inventory/lots')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send(lotAPayload)
      .expect(409);

    await request(app.getHttpServer())
      .post('/inventory/lots')
      .set('Authorization', `Bearer ${branchAToken}`)
      .send({
        productId: productA.body.id,
        warehouseId: branchBWarehouse.id,
        lotNumber: `LOT-CROSS-${suffix}`,
        expiresAt: expiresAt.toISOString(),
        quantity: 1,
      })
      .expect(400);

    const lotB = await request(app.getHttpServer())
      .post('/inventory/lots')
      .set('Authorization', `Bearer ${branchBToken}`)
      .send({
        productId: productB.body.id,
        warehouseId: branchBWarehouse.id,
        lotNumber: `LOT-B-${suffix}`,
        expiresAt: expiresAt.toISOString(),
        quantity: 3,
        unitCost: 30,
        note: 'E2E Şube B Lot Girişi',
      })
      .expect(201);

    const branchALots = await request(app.getHttpServer())
      .get('/inventory/lots?expiringWithinDays=30')
      .set('Authorization', `Bearer ${branchAToken}`)
      .expect(200);
    expect(branchALots.body.map((lot: { id: string }) => lot.id)).toEqual([
      lotA.body.id,
    ]);

    const branchBLots = await request(app.getHttpServer())
      .get('/inventory/lots?expiringWithinDays=30')
      .set('Authorization', `Bearer ${branchBToken}`)
      .expect(200);
    expect(branchBLots.body.map((lot: { id: string }) => lot.id)).toEqual([
      lotB.body.id,
    ]);

    const scopedAOverview = await request(app.getHttpServer())
      .get('/inventory/overview')
      .set('Authorization', `Bearer ${branchAToken}`)
      .expect(200);
    expect(scopedAOverview.body.expiringLots).toBe(1);
    expect(
      scopedAOverview.body.warehouses.every(
        (warehouse: { branchId: string | null }) =>
          warehouse.branchId === branchAId,
      ),
    ).toBe(true);

    const scopedBOverview = await request(app.getHttpServer())
      .get('/inventory/overview')
      .set('Authorization', `Bearer ${branchBToken}`)
      .expect(200);
    expect(scopedBOverview.body.expiringLots).toBe(1);
    expect(
      scopedBOverview.body.warehouses.every(
        (warehouse: { branchId: string | null }) =>
          warehouse.branchId === branchB.id,
      ),
    ).toBe(true);

    const allBranchesContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId: null })
      .expect(201);

    const allBranchesToken = allBranchesContext.body.accessToken as string;
    const allBranchesOverview = await request(app.getHttpServer())
      .get('/inventory/overview')
      .set('Authorization', `Bearer ${allBranchesToken}`)
      .expect(200);

    const branchIds = allBranchesOverview.body.warehouses.map(
      (warehouse: { branchId: string | null }) => warehouse.branchId,
    );
    expect(branchIds).toEqual(expect.arrayContaining([branchAId, branchB.id]));
    expect(branchIds).toContain(null);
    expect(allBranchesOverview.body.expiringLots).toBe(2);

    const allLots = await request(app.getHttpServer())
      .get('/inventory/lots?expiringWithinDays=30')
      .set('Authorization', `Bearer ${allBranchesToken}`)
      .expect(200);
    expect(allLots.body.map((lot: { id: string }) => lot.id)).toEqual(
      expect.arrayContaining([lotA.body.id, lotB.body.id]),
    );
  });
});
