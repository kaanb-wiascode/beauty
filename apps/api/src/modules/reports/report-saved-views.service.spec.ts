import { ForbiddenException } from '@nestjs/common';

import { reportKeys } from './report-definition';
import { ReportSavedViewsService } from './report-saved-views.service';

const user = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  membershipId: 'membership-1',
  roleId: 'role-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  roleScope: 'BRANCH',
} as const;

const saved = {
  id: 'saved-1',
  reportKey: reportKeys.staffPerformance,
  name: 'Personel görünümü',
  filters: {
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-30T23:59:59.999Z',
  },
  columns: ['name', 'collected'],
  sort: null,
  isFavorite: true,
  lastOpenedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createService(catalogKeys: readonly string[]) {
  const opened = { ...saved, lastOpenedAt: new Date() };
  const repository = {
    create: jest.fn().mockResolvedValue(saved),
    list: jest.fn().mockResolvedValue([
      saved,
      { ...saved, id: 'saved-2', reportKey: reportKeys.paymentSummary },
    ]),
    findById: jest.fn().mockResolvedValue(saved),
    markOpened: jest.fn().mockResolvedValue(opened),
    update: jest.fn().mockResolvedValue(saved),
    delete: jest.fn().mockResolvedValue(true),
  } as any;
  const reports = {
    getCatalog: jest.fn().mockResolvedValue(
      catalogKeys.map((key) => ({ key })),
    ),
  } as any;
  return {
    repository,
    reports,
    opened,
    service: new ReportSavedViewsService(repository, reports),
  };
}

describe('ReportSavedViewsService', () => {
  it('filters saved reports whose source-domain permission is no longer granted', async () => {
    const { service } = createService([reportKeys.staffPerformance]);

    await expect(service.list(user as any)).resolves.toEqual([saved]);
  });

  it('revalidates source-domain permission when opening a saved report', async () => {
    const { service, repository } = createService([]);

    await expect(service.get(user as any, saved.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repository.markOpened).not.toHaveBeenCalled();
  });

  it('marks an authorized saved report as recently opened', async () => {
    const { service, repository, opened } = createService([
      reportKeys.staffPerformance,
    ]);

    await expect(service.get(user as any, saved.id)).resolves.toEqual(opened);
    expect(repository.markOpened).toHaveBeenCalledWith(user, saved.id);
  });

  it('rejects unsupported columns before persistence', async () => {
    const { service, repository } = createService([reportKeys.staffPerformance]);

    await expect(
      service.create(user as any, {
        name: 'Bad view',
        reportKey: reportKeys.staffPerformance,
        filters: {
          from: new Date('2026-09-01T00:00:00.000Z'),
          to: new Date('2026-09-30T23:59:59.999Z'),
        },
        columns: ['name', 'tenantId'],
        isFavorite: false,
      }),
    ).rejects.toThrow('Unsupported saved report columns');
    expect(repository.create).not.toHaveBeenCalled();
  });
});
