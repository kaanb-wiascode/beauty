import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { FinancialIntegrationSyncService } from './financial-integration-sync.service';

@Injectable()
export class FinancialIntegrationSyncSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FinancialIntegrationSyncSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly sync: FinancialIntegrationSyncService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.run(), 15 * 60 * 1000);
    this.timer.unref?.();
    setTimeout(() => void this.run(), 30_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      const results = await this.sync.syncAllConnected();
      const failed = results.filter((result) => !result.ok);
      if (failed.length) {
        this.logger.warn(`Financial integration sync finished with ${failed.length} failure(s).`);
      }
    } catch (error) {
      this.logger.error(
        `Financial integration scheduler failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
