import { ForbiddenException } from '@nestjs/common';

import { ReportScheduleExecutionService } from './report-schedule-execution.service';
import type { ClaimedReportScheduleRun } from './report-schedule-runs.repository';

const claimed: ClaimedReportScheduleRun = {
  runId: 'run-1',
  runStatus: 'CLAIMED',
  scheduledFor: new Date('2026-09-15T06:30:00.000Z'),
  exportJobId: null,
  scheduleId: 'schedule-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  branchId: 'branch-1',
  ownerId: 'user-1',
  membershipId: 'membership-1',
  roleId: 'role-1',
  roleScope: 'BRANCH',
  reportKey: 'staff.performance',
  frequency: 'DAILY',
  timezone: 'Europe/Istanbul',
  localHour: 9,
  localMinute: 30,
  dayOfWeek: null,
  dayOfMonth: null,
  format: 'XLSX',
  filters: { datePreset: 'LAST_7_DAYS' },
  columns: ['name', 'collected'],
  sort: { key: 'collected', direction: 'desc' },
  includeSummary: true,
};

function createService(run: ClaimedReportScheduleRun = claimed) {
  const runs = {
    claimDue: jest.fn().mockResolvedValue(run),
    markQueued: jest.fn().mockResolvedValue(true),
    markFailed: jest.fn().mockResolvedValue(true),
    advanceSchedule: jest.fn().mockResolvedValue(true),
  } as any;
  const authorization = {
    validateSnapshot: jest.fn().mockResolvedValue({
      sub: 'user-1',
      tenantId: 'tenant-1',
      companyId: 'company-1',
      branchId: 'branch-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      roleScope: 'BRANCH',
    }),
  } as any;
  const reports = {
    prepareExport: jest.fn().mockResolvedValue({ columns: ['name', 'collected'] }),
  } as any;
  const exportJobs = {
    create: jest.fn().mockResolvedValue({ id: 'export-1' }),
  } as any;
  const policy = { assertCanQueue: jest.fn().mockResolvedValue(undefined) } as any;

  return {
    runs,
    authorization,
    reports,
    exportJobs,
    policy,
    service: new ReportScheduleExecutionService(
      runs,
      authorization,
      reports,
      exportJobs,
      policy,
    ),
  };
}

describe('ReportScheduleExecutionService', () => {
  it('queues a due run with a server-only idempotency key', async () => {
    const { service, exportJobs, runs } = createService();

    await expect(service.processNext()).resolves.toEqual({
      runId: 'run-1',
      status: 'QUEUED',
      exportJobId: 'export-1',
    });
    expect(exportJobs.create).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleRunId: 'run-1' }),
    );
    expect(runs.markQueued).toHaveBeenCalledWith('run-1', 'export-1');
    expect(runs.advanceSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: 'schedule-1',
        exportJobId: 'export-1',
      }),
    );
  });

  it('repairs an already queued run without creating another export', async () => {
    const { service, exportJobs, runs } = createService({
      ...claimed,
      runStatus: 'QUEUED',
      exportJobId: 'export-1',
    });

    await expect(service.processNext()).resolves.toEqual({
      runId: 'run-1',
      status: 'QUEUED',
    });
    expect(exportJobs.create).not.toHaveBeenCalled();
    expect(runs.advanceSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ exportJobId: 'export-1' }),
    );
  });

  it('records authorization revocation without queueing an export', async () => {
    const { service, authorization, exportJobs, runs } = createService();
    authorization.validateSnapshot.mockRejectedValueOnce(
      new ForbiddenException('revoked'),
    );

    await expect(service.processNext()).resolves.toEqual({
      runId: 'run-1',
      status: 'FAILED',
    });
    expect(exportJobs.create).not.toHaveBeenCalled();
    expect(runs.markFailed).toHaveBeenCalledWith(
      'run-1',
      'AUTHORIZATION_REVOKED',
      expect.any(String),
    );
  });

  it('fails closed for a tampered stored schedule payload', async () => {
    const { service, exportJobs, runs } = createService({
      ...claimed,
      columns: ['tenantId'],
      filters: { arbitrarySql: 'select *' },
    });

    await expect(service.processNext()).resolves.toEqual({
      runId: 'run-1',
      status: 'FAILED',
    });
    expect(exportJobs.create).not.toHaveBeenCalled();
    expect(runs.markFailed).toHaveBeenCalledWith(
      'run-1',
      'INVALID_SCHEDULE_PAYLOAD',
      expect.any(String),
    );
  });
});
