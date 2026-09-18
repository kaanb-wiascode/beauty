import { HttpException } from '@nestjs/common';

import { ReportExportPolicyService, ReportExportRowLimitError } from './report-export-policy.service';

const user = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  branchId: 'branch-1',
} as any;

function createPolicy(config: Record<string, string> = {}) {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ total: 0n }]),
  } as any;
  const configService = {
    get: jest.fn((key: string) => config[key]),
  } as any;

  return {
    prisma,
    policy: new ReportExportPolicyService(prisma, configService),
  };
}

describe('ReportExportPolicyService', () => {
  it('allows queueing below the active-job limit', async () => {
    const { policy, prisma } = createPolicy();
    prisma.$queryRaw.mockResolvedValueOnce([{ total: 2n }]);

    await expect(policy.assertCanQueue(user)).resolves.toBeUndefined();
  });

  it('rejects queueing when the requester active-job limit is reached', async () => {
    const { policy, prisma } = createPolicy();
    prisma.$queryRaw.mockResolvedValueOnce([{ total: 3n }]);

    await expect(policy.assertCanQueue(user)).rejects.toBeInstanceOf(HttpException);
  });

  it('uses bounded active-job configuration', async () => {
    const { policy, prisma } = createPolicy({ REPORT_EXPORT_ACTIVE_JOB_LIMIT: '999' });
    prisma.$queryRaw.mockResolvedValueOnce([{ total: 3n }]);

    await expect(policy.assertCanQueue(user)).rejects.toBeInstanceOf(HttpException);
  });

  it('enforces the default export row limit', () => {
    const { policy } = createPolicy();

    expect(() => policy.assertRowLimit(50_000)).not.toThrow();
    expect(() => policy.assertRowLimit(50_001)).toThrow(ReportExportRowLimitError);
  });

  it('uses bounded row-limit configuration', () => {
    const { policy } = createPolicy({ REPORT_EXPORT_ROW_LIMIT: '1000' });

    expect(() => policy.assertRowLimit(1000)).not.toThrow();
    expect(() => policy.assertRowLimit(1001)).toThrow(ReportExportRowLimitError);
  });
});
