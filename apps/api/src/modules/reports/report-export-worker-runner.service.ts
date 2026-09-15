import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ReportExportExpiryService } from './report-export-expiry.service';
import { ReportExportProcessorService } from './report-export-processor.service';

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
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (!this.enabled()) return;

    const intervalMs = this.pollIntervalMs();
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

    try {
      await this.expiry.cleanup(this.expiryBatchSize());

      let processed = 0;
      const batchSize = this.batchSize();

      while (processed < batchSize) {
        const result = await this.processor.processNext();
        if (!result) break;
        processed += 1;
      }

      return processed;
    } catch {
      this.logger.error('Report export worker iteration failed');
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

  private expiryBatchSize() {
    return this.boundedInteger(
      this.config.get<string>('REPORT_EXPORT_EXPIRY_BATCH_SIZE'),
      100,
      1,
      500,
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
