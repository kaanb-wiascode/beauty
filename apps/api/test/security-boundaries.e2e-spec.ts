import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@beauty-erp/database';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaExceptionFilter } from '../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from '../src/common/validation/zod-exception.filter';
import { TenantContext } from '../src/common/tenant/tenant-context';
import { OrganizationScopeService } from '../src/common/tenant/organization-scope.service';
import { InventoryScopeService } from '../src/modules/inventory/inventory-scope.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { AccountsPayableService } from '../src/modules/accounts-payable/accounts-payable.service';

jest.setTimeout(120_000);

// These tests require PostgreSQL with all Prisma migrations deployed.
// Run against an isolated test database: pnpm --filter api test:e2e
describe('Security and tenant boundaries (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  type TenantFixture = {
    tenantId: string;
    companyId: string;
    branchId: string;
    membershipId: string;
    ownerToken: string;
    branchToken: string;
  };

  let tenantA: TenantFixture;
  let tenantB: TenantFixture;
  let ownerRoleId: string;
  let viewerRoleId: string;
  let branchManagerRoleId: string;
  let centralRoleId: string;
  let viewerToken: string;
  let branchManagerToken: string;
  let foreignStaffId: string;

  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const password = 'E2eStrongPassword!2026';
  const email = (label: string) => `security-${label}-${suffix}@example.test`;

  async function registerTenant(label: string): Promise<TenantFixture> {
    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: email(`owner-${label}`),
        password,
        firstName: 'Security',
        lastName: 'Owner',
        tenantName: `Security ${label} ${suffix}`,
        tenantSlug: `security-${label}-${suffix}`,
      })
      .expect(201);

    const registered = registration.body as {
      tenant: { id: string };
      company: { id: string };
      branch: { id: string };
      membership: { id: string };
    };

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: email(`owner-${label}`), password })
      .expect(201);
    const ownerToken = (login.body as { accessToken: string }).accessToken;

    const context = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        membershipId: registered.membership.id,
        branchId: registered.branch.id,
      })
      .expect(201);

    return {
      tenantId: registered.tenant.id,
      companyId: registered.company.id,
      branchId: registered.branch.id,
      membershipId: registered.membership.id,
      ownerToken,
      branchToken: (context.body as { accessToken: string }).accessToken,
    };
  }

  async function createBranchUser(roleId: string, label: string): Promise<string> {
    await request(app.getHttpServer())
      .post('/auth/users')
      .set('Authorization', `Bearer ${tenantA.branchToken}`)
      .send({
        email: email(label),
        password,
        firstName: 'Security',
        lastName: label,
        roleId,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: email(label), password })
      .expect(201);

    return (login.body as { accessToken: string }).accessToken;
  }

  beforeAll(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalFilters(new PrismaExceptionFilter(), new ZodExceptionFilter());
    await app.init();
    prisma = fixture.get(PrismaService);

    tenantA = await registerTenant('a');
    tenantB = await registerTenant('b');

    const owner = await prisma.role.findFirstOrThrow({
      where: { tenantId: tenantA.tenantId, companyId: tenantA.companyId, slug: 'owner' },
      select: { id: true },
    });
    ownerRoleId = owner.id;

    const rolesUpdate = await prisma.permission.findUniqueOrThrow({
      where: { resource_action: { resource: 'roles', action: 'update' } },
      select: { id: true },
    });

    const viewer = await prisma.role.create({
      data: {
        tenantId: tenantA.tenantId,
        companyId: tenantA.companyId,
        name: 'Security viewer',
        slug: `security-viewer-${suffix}`,
        scope: 'BRANCH',
      },
    });
    viewerRoleId = viewer.id;

    const manager = await prisma.role.create({
      data: {
        tenantId: tenantA.tenantId,
        companyId: tenantA.companyId,
        name: 'Security branch manager',
        slug: `security-manager-${suffix}`,
        scope: 'BRANCH',
        rolePermissions: {
          create: { permissionId: rolesUpdate.id },
        },
      },
    });
    branchManagerRoleId = manager.id;

    const central = await prisma.role.create({
      data: {
        tenantId: tenantA.tenantId,
        companyId: tenantA.companyId,
        name: 'Security central role',
        slug: `security-central-${suffix}`,
        scope: 'CENTRAL',
        rolePermissions: {
          create: { permissionId: rolesUpdate.id },
        },
      },
    });
    centralRoleId = central.id;

    viewerToken = await createBranchUser(viewerRoleId, 'viewer');
    branchManagerToken = await createBranchUser(branchManagerRoleId, 'manager');

    const foreignStaff = await prisma.staff.create({
      data: {
        tenantId: tenantB.tenantId,
        branchId: tenantB.branchId,
        firstName: 'Other tenant',
        lastName: 'Employee',
      },
    });
    foreignStaffId = foreignStaff.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 403 on POST /auth/users for a user without role permissions', async () => {
    await request(app.getHttpServer())
      .post('/auth/users')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        email: email('forbidden-user'),
        password,
        firstName: 'Blocked',
        lastName: 'Creation',
        roleId: viewerRoleId,
      })
      .expect(403);
  });

  it('returns 403 for unauthorized inventory and HR endpoints', async () => {
    await request(app.getHttpServer())
      .post('/inventory/products')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Unauthorized inventory product', initialQuantity: 1 })
      .expect(403);

    await request(app.getHttpServer())
      .post('/hr/leaves')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        staffId: foreignStaffId,
        startDate: '2026-11-01',
        endDate: '2026-11-01',
        days: 1,
      })
      .expect(403);
  });

  it('prevents BRANCH managers from assigning owner and CENTRAL roles', async () => {
    for (const [roleId, label] of [
      [ownerRoleId, 'owner-escalation'],
      [centralRoleId, 'central-escalation'],
    ] as const) {
      const attemptedEmail = email(label);
      await request(app.getHttpServer())
        .post('/auth/users')
        .set('Authorization', `Bearer ${branchManagerToken}`)
        .send({
          email: attemptedEmail,
          password,
          firstName: 'Blocked',
          lastName: 'Escalation',
          roleId,
        })
        .expect(403);

      expect(await prisma.user.findUnique({
        where: { email: attemptedEmail },
        select: { id: true },
      })).toBeNull();
    }
  });

  it('does not create Tenant A HR leave requests for Tenant B staff IDs', async () => {
    await request(app.getHttpServer())
      .post('/hr/leaves')
      .set('Authorization', `Bearer ${tenantA.branchToken}`)
      .send({
        staffId: foreignStaffId,
        branchId: tenantA.branchId,
        startDate: '2026-11-02',
        endDate: '2026-11-02',
        days: 1,
        reason: 'Tenant isolation check',
      })
      .expect(404);

    const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      'SELECT COUNT(*)::int AS count FROM leave_requests WHERE tenant_id=$1::text AND staff_id=$2::text',
      tenantA.tenantId,
      foreignStaffId,
    );
    expect(rows[0]?.count).toBe(0);
  });

  it('rolls back insufficient addMovement without changing stock or movements', async () => {
    const productResponse = await request(app.getHttpServer())
      .post('/inventory/products')
      .set('Authorization', `Bearer ${tenantA.branchToken}`)
      .send({ name: `Security stock ${suffix}`, initialQuantity: 2 })
      .expect(201);
    const productId = (productResponse.body as { id: string }).id;

    type StockRow = { warehouseId: string; quantity: number | string };
    const stocks = await prisma.$queryRawUnsafe<StockRow[]>(
      'SELECT warehouse_id AS "warehouseId",quantity FROM inventory_stock WHERE product_id=$1::text',
      productId,
    );
    expect(stocks).toHaveLength(1);
    const warehouseId = stocks[0].warehouseId;
    const initialQuantity = Number(stocks[0].quantity);
    expect(initialQuantity).toBe(2);

    const countMovements = async (): Promise<number> => {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
        'SELECT COUNT(*)::int AS count FROM inventory_movements WHERE product_id=$1::text AND warehouse_id=$2::text',
        productId,
        warehouseId,
      );
      return rows[0].count;
    };
    const movementsBefore = await countMovements();

    const tenantContext = new TenantContext();
    tenantContext.setContext({
      tenantId: tenantA.tenantId,
      companyId: tenantA.companyId,
      branchId: tenantA.branchId,
      membershipId: tenantA.membershipId,
      roleScope: 'CENTRAL',
    });
    const organizationScope = new OrganizationScopeService(prisma, tenantContext);
    const inventoryScope = new InventoryScopeService(organizationScope, tenantContext);
    const inventory = new InventoryService(
      prisma,
      tenantContext,
      inventoryScope,
      {} as AccountsPayableService,
    );

    await expect(
      inventory.addMovement(productId, warehouseId, 5, 'ADJUSTMENT_OUT'),
    ).rejects.toBeInstanceOf(BadRequestException);

    const after = await prisma.$queryRawUnsafe<StockRow[]>(
      'SELECT warehouse_id AS "warehouseId",quantity FROM inventory_stock WHERE product_id=$1::text',
      productId,
    );
    expect(Number(after[0].quantity)).toBe(initialQuantity);
    expect(await countMovements()).toBe(movementsBefore);
  });
});
