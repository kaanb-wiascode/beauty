import { Injectable } from '@nestjs/common';

import { ReportExportStaleRepository } from './report-export-stale.repository';

@Injectable()
export class ReportExportStaleService {
  constructor(private readonly stale: ReportExportStaleRepository) {}

  async recover(minutes = 30, limit = 100) {
    const boundedMinutes = this.boundedInteger(minutes, 30, 5, 1_440);
    const boundedLimit = this.boundedInteger(limit, 100, 1, 500);
    const threshold = new Date(Date.now() - boundedMinutes * 60_000);
    const failed = await this.stale.failStale(threshold, boundedLimit);

    return { failed: failed.length };
  }

  private boundedInteger(
    value: number,
    fallback: number,
    min: number,
    max: number,
  ) {
    if (!Number.isInteger(value) || value < min || value > max) {
      return fallback;
    }
    return value;
  }
}
