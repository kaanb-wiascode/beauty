import { ReportExportBrandingService } from './report-export-branding.service';

const user = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  membershipId: 'membership-1',
  roleId: 'role-1',
  roleScope: 'BRANCH' as const,
};

describe('ReportExportBrandingService', () => {
  it('resolves active company and branch names from authenticated scope', async () => {
    const prisma = {
      company: {
        findFirst: jest.fn().mockResolvedValue({ name: 'Güzellik Dünyası' }),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ name: 'Kadıköy' }),
      },
    } as any;
    const service = new ReportExportBrandingService(prisma);

    await expect(service.resolve(user)).resolves.toEqual({
      companyName: 'Güzellik Dünyası',
      branchName: 'Kadıköy',
    });
    expect(prisma.company.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'company-1',
        tenantId: 'tenant-1',
        status: 'ACTIVE',
      },
      select: { name: true },
    });
    expect(prisma.branch.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'branch-1',
        companyId: 'company-1',
        status: 'ACTIVE',
      },
      select: { name: true },
    });
  });

  it('does not query a branch for company scoped exports', async () => {
    const prisma = {
      company: {
        findFirst: jest.fn().mockResolvedValue({ name: 'Beauty Group' }),
      },
      branch: { findFirst: jest.fn() },
    } as any;
    const service = new ReportExportBrandingService(prisma);

    await expect(service.resolve({ ...user, branchId: null, roleScope: 'COMPANY' })).resolves.toEqual({
      companyName: 'Beauty Group',
      branchName: null,
    });
    expect(prisma.branch.findFirst).not.toHaveBeenCalled();
  });

  it('falls back safely when the company is unavailable', async () => {
    const prisma = {
      company: { findFirst: jest.fn().mockResolvedValue(null) },
      branch: { findFirst: jest.fn() },
    } as any;
    const service = new ReportExportBrandingService(prisma);

    await expect(service.resolve(user)).resolves.toEqual({
      companyName: 'WiOS 360',
      branchName: null,
    });
    expect(prisma.branch.findFirst).not.toHaveBeenCalled();
  });
});
