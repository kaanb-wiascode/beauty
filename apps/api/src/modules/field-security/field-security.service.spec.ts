import { FieldSecurityService } from './field-security.service';

describe('FieldSecurityService', () => {
  const context = {
    tenantId: 'tenant-a',
    companyId: 'company-a',
    membershipId: 'membership-a',
    branchId: 'branch-a',
  };
  const tenantContext = { getContext: () => context } as any;
  const audit = { record: jest.fn() } as any;

  beforeEach(() => jest.clearAllMocks());

  it('denies field access when neither role nor temporary grant provides the required permission', async () => {
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      membership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'membership-a', roleId: 'role-a' }),
      },
      rolePermission: { count: jest.fn().mockResolvedValue(0) },
    } as any;
    const service = new FieldSecurityService(prisma, tenantContext, audit);

    await expect(service.canRead('hr.employee.compensation-payroll', {
      resource: 'hr_sensitive',
      action: 'read',
    })).resolves.toBe(false);

    expect(prisma.rolePermission.count).toHaveBeenCalledWith({
      where: {
        roleId: 'role-a',
        permission: { resource: 'hr_sensitive', action: 'read' },
      },
    });
  });

  it('allows field access from the role permission', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValueOnce([{
        requiredResource: 'hr_compensation',
        requiredAction: 'read',
      }]),
      membership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'membership-a', roleId: 'role-a' }),
      },
      rolePermission: { count: jest.fn().mockResolvedValue(1) },
    } as any;
    const service = new FieldSecurityService(prisma, tenantContext, audit);

    await expect(service.canRead('hr.employee.compensation-payroll', {
      resource: 'hr_sensitive',
      action: 'read',
    })).resolves.toBe(true);
  });

  it('allows field access from an active temporary permission grant', async () => {
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'grant-a' }]),
      membership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'membership-a', roleId: 'role-a' }),
      },
      rolePermission: { count: jest.fn().mockResolvedValue(0) },
    } as any;
    const service = new FieldSecurityService(prisma, tenantContext, audit);

    await expect(service.canRead('hr.employee.identity-banking', {
      resource: 'hr_sensitive',
      action: 'read',
    })).resolves.toBe(true);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
