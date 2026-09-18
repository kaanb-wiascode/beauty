import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PosWebhookQueueService } from './pos-webhook-queue.service';

@Injectable()
export class PosWebhookQueueSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PosWebhookQueueSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly queue: PosWebhookQueueService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.run(), 60_000);
    this.timer.unref?.();
    setTimeout(() => void this.run(), 15_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      const results = await this.queue.processDue();
      const failed = results.filter((result) => !result.ok);
      if (failed.length) {
        this.logger.warn(`POS webhook queue processed with ${failed.length} pending/dead-letter event(s).`);
      }
    } catch (error) {
      this.logger.error(
        `POS webhook queue scheduler failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
