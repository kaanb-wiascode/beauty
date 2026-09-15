import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

import { ReportExportAuthorizationService } from './report-export-authorization.service';
import type { ReportExportJobRecord } from './report-export-jobs.repository';

const job: ReportExportJobRecord = {
  id: 'export-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  roleScope: 'BRANCH',
  membershipId: 'membership-1',
  roleId: 'role-1',
  requestedBy: 'user-1',
  reportKey: 'staff.performance',
  format: 'CSV',
  status: 'PROCESSING',
  filters: {},
  columns: ['name'],
  sort: null,
  includeSummary: true,
  includeCharts: false,
  rowCount: null,
  storageKey: null,
  scheduleRunId: null,
  errorCode: null,
  errorSummary: null,
  requestedAt: new Date(),
  startedAt: new Date(),
  completedAt: null,
  expiresAt: null,
  updatedAt: new Date(),
};

function createService() {
  const prisma = {
    membership: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'membership-1',
        companyId: 'company-1',
        role: { id: 'role-1', companyId: 'company-1', scope: 'BRANCH' },
        branchAccesses: [{ branchId: 'branch-1' }],
      }),
    },
    branch: {
      findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }),
    },
    rolePermission: {
      findMany: jest.fn().mockResolvedValue([
        { permission: { resource: 'reports', action: 'read' } },
        { permission: { resource: 'staff', action: 'read' } },
      ]),
    },
  } as any;

  return {
    prisma,
    service: new ReportExportAuthorizationService(prisma),
  };
}

describe('ReportExportAuthorizationService', () => {
  it('revalidates the current membership, branch and layered permissions', async () => {
    const { service } = createService();

    await expect(service.validate(job)).resolves.toEqual({
      sub: 'user-1',
      tenantId: 'tenant-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      roleScope: 'BRANCH',
    });
  });

  it('rejects a job when the requester membership is no longer active', async () => {
    const { service, prisma } = createService();
    prisma.membership.findFirst.mockResolvedValueOnce(null);

    await expect(service.validate(job)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a job when branch access was revoked', async () => {
    const { service, prisma } = createService();
    prisma.membership.findFirst.mockResolvedValueOnce({
      id: 'membership-1',
      companyId: 'company-1',
      role: { id: 'role-1', companyId: 'company-1', scope: 'BRANCH' },
      branchAccesses: [],
    });

    await expect(service.validate(job)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a job when a source-domain permission was revoked', async () => {
    const { service, prisma } = createService();
    prisma.rolePermission.findMany.mockResolvedValueOnce([
      { permission: { resource: 'reports', action: 'read' } },
    ]);

    await expect(service.validate(job)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
