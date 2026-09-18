import { Injectable, Logger } from '@nestjs/common';

import { ReportExportExpiryRepository } from './report-export-expiry.repository';
import { ReportExportStorageService } from './report-export-storage.service';

@Injectable()
export class ReportExportExpiryService {
  private readonly logger = new Logger(ReportExportExpiryService.name);

  constructor(
    private readonly expiry: ReportExportExpiryRepository,
    private readonly storage: ReportExportStorageService,
  ) {}

  async cleanup(limit = 100) {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const expired = await this.expiry.expireDue(boundedLimit);

    let deleted = 0;
    for (const job of expired) {
      if (!job.storageKey) continue;
      try {
        await this.storage.delete(job.storageKey);
        deleted += 1;
      } catch {
        this.logger.warn(`Expired report artifact cleanup failed for job ${job.id}`);
      }
    }

    return { expired: expired.length, deleted };
  }
}
