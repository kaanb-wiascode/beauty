import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ReportExportExpiryService } from './report-export-expiry.service';
import { ReportExportProcessorService } from './report-export-processor.service';
import { ReportExportStaleService } from './report-export-stale.service';
import { ReportScheduleExecutionService } from './report-schedule-execution.service';

@Injectable()
export class ReportExportWorkerRunnerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ReportExportWorkerRunnerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly processor: ReportExportProcessorService,
    private readonly expiry: ReportExportExpiryService,
    private readonly stale: ReportExportStaleService,
    private readonly config: ConfigService,
    @Optional() private readonly schedules?: ReportScheduleExecutionService,
  ) {}

  onApplicationBootstrap() {
    if (!this.enabled()) return;

    const intervalMs = this.pollIntervalMs();
    this.logger.log(
      JSON.stringify({
        event: 'report_export_worker_started',
        pollIntervalMs: intervalMs,
        batchSize: this.batchSize(),
        scheduleBatchSize: this.scheduleBatchSize(),
        expiryBatchSize: this.expiryBatchSize(),
        staleBatchSize: this.staleBatchSize(),
        staleProcessingMinutes: this.staleProcessingMinutes(),
      }),
    );

    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref?.();

    void this.tick();
  }

  onApplicationShutdown() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    if (this.running) return 0;
    this.running = true;
    const startedAt = Date.now();
    const batchSize = this.batchSize();
    const scheduleBatchSize = this.scheduleBatchSize();
    const expiryBatchSize = this.expiryBatchSize();
    const staleBatchSize = this.staleBatchSize();
    const staleProcessingMinutes = this.staleProcessingMinutes();

    try {
      const recovery = await this.stale.recover(
        staleProcessingMinutes,
        staleBatchSize,
      );
      const cleanup = await this.expiry.cleanup(expiryBatchSize);

      let scheduled = 0;
      if (this.schedules) {
        while (scheduled < scheduleBatchSize) {
          const result = await this.schedules.processNext();
          if (!result) break;
          scheduled += 1;
        }
      }

      let processed = 0;
      while (processed < batchSize) {
        const result = await this.processor.processNext();
        if (!result) break;
        processed += 1;
      }

      if (
        scheduled > 0 ||
        processed > 0 ||
        cleanup.expired > 0 ||
        recovery.failed > 0
      ) {
        this.logger.log(
          JSON.stringify({
            event: 'report_export_worker_tick',
            scheduled,
            processed,
            staleFailed: recovery.failed,
            expired: cleanup.expired,
            deleted: cleanup.deleted,
            durationMs: Date.now() - startedAt,
          }),
        );
      }

      return processed;
    } catch {
      this.logger.error(
        JSON.stringify({
          event: 'report_export_worker_failed',
          batchSize,
          scheduleBatchSize,
          expiryBatchSize,
          staleBatchSize,
          staleProcessingMinutes,
          durationMs: Date.now() - startedAt,
        }),
      );
      return 0;
    } finally {
      this.running = false;
    }
  }

  private enabled() {
    return this.config.get<string>('REPORT_EXPORT_WORKER_ENABLED') === 'true';
  }

  private pollIntervalMs() {
    return this.boundedInteger(
      this.config.get<string>('REPORT_EXPORT_WORKER_POLL_MS'),
      5_000,
      1_000,
      60_000,
    );
  }

  private batchSize() {
    return this.boundedInteger(
      this.config.get<string>('REPORT_EXPORT_WORKER_BATCH_SIZE'),
      5,
      1,
      20,
    );
  }

  private scheduleBatchSize() {
    return this.boundedInteger(
      this.config.get<string>('REPORT_SCHEDULE_BATCH_SIZE'),
      5,
      1,
      20,
    );
  }

  private expiryBatchSize() {
    return this.boundedInteger(
      this.config.get<string>('REPORT_EXPORT_EXPIRY_BATCH_SIZE'),
      100,
      1,
      500,
    );
  }

  private staleBatchSize() {
    return this.boundedInteger(
      this.config.get<string>('REPORT_EXPORT_STALE_BATCH_SIZE'),
      100,
      1,
      500,
    );
  }

  private staleProcessingMinutes() {
    return this.boundedInteger(
      this.config.get<string>('REPORT_EXPORT_STALE_PROCESSING_MINUTES'),
      30,
      5,
      1_440,
    );
  }

  private boundedInteger(
    raw: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ) {
    const value = Number(raw ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) {
      return fallback;
    }
    return value;
  }
}
