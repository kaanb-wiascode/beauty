import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZodError } from 'zod';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { reportExportSchema } from './dto/report-export.dto';
import { ReportCsvGenerator } from './report-csv.generator';
import { ReportExportAuthorizationService } from './report-export-authorization.service';
import {
  ReportExportJobsRepository,
  type ReportExportJobRecord,
} from './report-export-jobs.repository';
import { ReportExportStorageService } from './report-export-storage.service';
import { ReportExportWorkerContextService } from './report-export-worker-context.service';

@Injectable()
export class ReportExportProcessorService {
  constructor(
    private readonly jobs: ReportExportJobsRepository,
    private readonly authorization: ReportExportAuthorizationService,
    private readonly workerContext: ReportExportWorkerContextService,
    private readonly csv: ReportCsvGenerator,
    private readonly storage: ReportExportStorageService,
    private readonly config: ConfigService,
  ) {}

  async processNext() {
    const job = await this.jobs.claimNextQueued();
    if (!job) return null;

    try {
      const user = await this.authorization.validate(job);
      const input = reportExportSchema.parse({
        reportKey: job.reportKey,
        format: job.format,
        filters: job.filters,
        columns: job.columns,
        sort: job.sort ?? undefined,
        includeSummary: job.includeSummary,
        includeCharts: job.includeCharts,
      });

      if (input.format !== 'CSV') {
        return this.jobs.markFailed(job.id, {
          errorCode: 'FORMAT_NOT_IMPLEMENTED',
          errorSummary: `${input.format} export generation is not available yet.`,
        });
      }

      const materialized = await this.workerContext.materialize(user, input);
      const content = this.csv.generate(materialized.columns, materialized.rows);
      const storageKey = await this.storage.write({
        tenantId: job.tenantId,
        jobId: job.id,
        extension: 'csv',
        content,
      });
      const expiresAt = new Date(
        Date.now() + this.retentionDays() * 24 * 60 * 60 * 1000,
      );

      return await this.completeReadyTransition(user, job.id, storageKey, {
        rowCount: materialized.rows.length,
        expiresAt,
      });
    } catch (error) {
      const failure = this.safeFailure(error);
      return this.jobs.markFailed(job.id, failure);
    }
  }

  private async completeReadyTransition(
    user: JwtPayload,
    jobId: string,
    storageKey: string,
    input: { rowCount: number; expiresAt: Date },
  ) {
    let transitionError: unknown = null;

    try {
      const ready = await this.jobs.markReady(jobId, {
        rowCount: input.rowCount,
        storageKey,
        expiresAt: input.expiresAt,
      });
      if (ready) return ready;
      transitionError = new Error('Export READY transition was not applied');
    } catch (error) {
      transitionError = error;
    }

    const persisted = await this.readPersistedJob(user, jobId);
    if (persisted?.status === 'READY') {
      if (persisted.storageKey !== storageKey) {
        await this.deleteOrphanArtifact(storageKey);
      }
      return persisted;
    }

    if (persisted !== undefined) {
      await this.deleteOrphanArtifact(storageKey);
    }

    throw transitionError;
  }

  private async readPersistedJob(
    user: JwtPayload,
    jobId: string,
  ): Promise<ReportExportJobRecord | null | undefined> {
    try {
      return await this.jobs.findById(user, jobId);
    } catch {
      // The READY write may have committed even when its acknowledgement failed.
      // Preserve the artifact when persisted state cannot be verified.
      return undefined;
    }
  }

  private async deleteOrphanArtifact(storageKey: string) {
    try {
      await this.storage.delete(storageKey);
    } catch {
      // Cleanup is best-effort and must not replace the primary transition error.
    }
  }

  private retentionDays() {
    const configured = Number(
      this.config.get<string>('REPORT_EXPORT_RETENTION_DAYS') ?? '7',
    );

    if (!Number.isInteger(configured) || configured < 1 || configured > 365) {
      return 7;
    }

    return configured;
  }

  private safeFailure(error: unknown) {
    if (
      error instanceof UnauthorizedException ||
      error instanceof ForbiddenException
    ) {
      return {
        errorCode: 'AUTHORIZATION_REVOKED',
        errorSummary: 'Export authorization is no longer valid.',
      };
    }

    if (error instanceof ZodError) {
      return {
        errorCode: 'INVALID_JOB_PAYLOAD',
        errorSummary: 'Stored export parameters are invalid.',
      };
    }

    return {
      errorCode: 'EXPORT_GENERATION_FAILED',
      errorSummary: 'The export could not be generated.',
    };
  }
}
