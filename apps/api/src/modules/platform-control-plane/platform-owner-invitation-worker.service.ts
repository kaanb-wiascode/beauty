import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PlatformOwnerInvitationBatchService } from './platform-owner-invitation-batch.service';

const WORKER_INTERVAL_MS = 60_000;
const WORKER_BATCH_SIZE = 25;

@Injectable()
export class PlatformOwnerInvitationWorkerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PlatformOwnerInvitationWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly config: ConfigService,
    private readonly batch: PlatformOwnerInvitationBatchService,
  ) {}

  onApplicationBootstrap() {
    if (!this.isConfigured()) {
      this.logger.log('Platform owner invitation worker is disabled because delivery is not configured.');
      return;
    }

    this.stopped = false;
    this.schedule(5_000);
  }

  onApplicationShutdown() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async runOnce() {
    if (!this.isConfigured()) {
      return {
        skipped: true as const,
        reason: 'INVITATION_DELIVERY_NOT_CONFIGURED' as const,
      };
    }

    return this.batch.dispatchDue(
      null,
      'Automated owner invitation delivery retry.',
      WORKER_BATCH_SIZE,
      null,
    );
  }

  private schedule(delayMs: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch((error: unknown) => {
          this.logger.error(
            'Platform owner invitation worker batch failed.',
            error instanceof Error ? error.stack : String(error),
          );
        })
        .finally(() => this.schedule(WORKER_INTERVAL_MS));
    }, delayMs);
    this.timer.unref();
  }

  private isConfigured() {
    return Boolean(
      this.config.get<string>('PLATFORM_INVITATION_WEBHOOK_URL') &&
        this.config.get<string>('PLATFORM_INVITATION_WEBHOOK_SECRET'),
    );
  }
}
