import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { z, ZodError } from 'zod';

import { reportExportSchema } from './dto/report-export.dto';
import { reportScheduleDatePresets } from './dto/report-schedule.dto';
import { ReportExportAuthorizationService } from './report-export-authorization.service';
import { ReportExportJobsRepository } from './report-export-jobs.repository';
import { ReportExportPolicyService } from './report-export-policy.service';
import {
  ReportScheduleRunsRepository,
  type ClaimedReportScheduleRun,
} from './report-schedule-runs.repository';
import {
  nextReportScheduleRun,
  resolveReportScheduleDateRange,
} from './report-schedule-time';
import { ReportsService } from './reports.service';

const storedScheduleFiltersSchema = z
  .object({ datePreset: z.enum(reportScheduleDatePresets) })
  .strict();
const storedColumnsSchema = z.array(z.string().min(1).max(80)).min(1).max(20);
const storedSortSchema = z
  .object({
    key: z.string().min(1).max(80),
    direction: z.enum(['asc', 'desc']),
  })
  .strict()
  .nullable();

@Injectable()
export class ReportScheduleExecutionService {
  constructor(
    private readonly runs: ReportScheduleRunsRepository,
    private readonly authorization: ReportExportAuthorizationService,
    private readonly reports: ReportsService,
    private readonly exportJobs: ReportExportJobsRepository,
    private readonly exportPolicy: ReportExportPolicyService,
  ) {}

  async processNext() {
    const claimed = await this.runs.claimDue();
    if (!claimed) return null;

    const nextRunAt = this.nextRun(claimed);

    if (claimed.runStatus === 'QUEUED') {
      await this.runs.advanceSchedule({
        scheduleId: claimed.scheduleId,
        scheduledFor: claimed.scheduledFor,
        nextRunAt,
        exportJobId: claimed.exportJobId,
      });
      return { runId: claimed.runId, status: 'QUEUED' as const };
    }

    if (claimed.runStatus === 'FAILED') {
      await this.runs.advanceSchedule({
        scheduleId: claimed.scheduleId,
        scheduledFor: claimed.scheduledFor,
        nextRunAt,
        errorCode: 'SCHEDULE_RUN_FAILED',
      });
      return { runId: claimed.runId, status: 'FAILED' as const };
    }

    try {
      const user = await this.authorization.validateSnapshot({
        tenantId: claimed.tenantId,
        companyId: claimed.companyId,
        branchId: claimed.branchId,
        roleScope: claimed.roleScope,
        membershipId: claimed.membershipId,
        roleId: claimed.roleId,
        requestedBy: claimed.ownerId,
        reportKey: claimed.reportKey,
      });
      await this.exportPolicy.assertCanQueue(user);

      const storedFilters = storedScheduleFiltersSchema.parse(claimed.filters);
      const columns = storedColumnsSchema.parse(claimed.columns);
      const sort = storedSortSchema.parse(claimed.sort ?? null);
      const filters = resolveReportScheduleDateRange(
        storedFilters.datePreset,
        claimed.timezone,
        claimed.scheduledFor,
      );
      const input = reportExportSchema.parse({
        reportKey: claimed.reportKey,
        format: claimed.format,
        filters,
        columns,
        columnMode: 'VISIBLE',
        sort: sort ?? undefined,
        includeSummary: claimed.includeSummary,
        includeCharts: false,
      });
      const prepared = await this.reports.prepareExport(user, input);
      const job = await this.exportJobs.create({
        user,
        input,
        columns: prepared.columns,
        scheduleRunId: claimed.runId,
      });
      if (!job) throw new Error('Scheduled export job was not created');

      await this.runs.markQueued(claimed.runId, job.id);
      await this.runs.advanceSchedule({
        scheduleId: claimed.scheduleId,
        scheduledFor: claimed.scheduledFor,
        nextRunAt,
        exportJobId: job.id,
      });
      return { runId: claimed.runId, status: 'QUEUED' as const, exportJobId: job.id };
    } catch (error) {
      const failure = this.safeFailure(error);
      await this.runs.markFailed(claimed.runId, failure.code, failure.summary);
      await this.runs.advanceSchedule({
        scheduleId: claimed.scheduleId,
        scheduledFor: claimed.scheduledFor,
        nextRunAt,
        errorCode: failure.code,
      });
      return { runId: claimed.runId, status: 'FAILED' as const };
    }
  }

  private nextRun(run: ClaimedReportScheduleRun) {
    return nextReportScheduleRun(
      {
        frequency: run.frequency,
        timezone: run.timezone,
        localHour: run.localHour,
        localMinute: run.localMinute,
        dayOfWeek: run.dayOfWeek ?? undefined,
        dayOfMonth: run.dayOfMonth ?? undefined,
      },
      new Date(run.scheduledFor.getTime() + 1),
    );
  }

  private safeFailure(error: unknown) {
    if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
      return {
        code: 'AUTHORIZATION_REVOKED',
        summary: 'Scheduled report authorization is no longer valid.',
      };
    }
    if (error instanceof ZodError) {
      return {
        code: 'INVALID_SCHEDULE_PAYLOAD',
        summary: 'Scheduled report configuration is no longer valid.',
      };
    }
    return {
      code: 'SCHEDULE_QUEUE_FAILED',
      summary: 'Scheduled report could not be queued.',
    };
  }
}
