import { Injectable } from '@nestjs/common';

import type { JwtPayload } from '../../common/auth/jwt.strategy';
import type { ReportComparisonInput } from './dto/report-comparison.dto';
import { ReportsService } from './reports.service';

export type ReportComparisonMetric = {
  key: string;
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
};

@Injectable()
export class ReportComparisonService {
  constructor(private readonly reports: ReportsService) {}

  async compare(user: JwtPayload, input: ReportComparisonInput) {
    const previous = this.previousRange(input.filters.from, input.filters.to);
    const [currentResult, previousResult] = await Promise.all([
      this.reports.preview(user, {
        reportKey: input.reportKey,
        filters: input.filters,
        page: 1,
        limit: 1,
      }),
      this.reports.preview(user, {
        reportKey: input.reportKey,
        filters: previous,
        page: 1,
        limit: 1,
      }),
    ]);

    const current = this.numericSummary(currentResult);
    const prior = this.numericSummary(previousResult);
    const keys = [...new Set([...Object.keys(current), ...Object.keys(prior)])];

    return {
      reportKey: input.reportKey,
      currentPeriod: input.filters,
      previousPeriod: previous,
      metrics: keys.map((key) => {
        const currentValue = current[key] ?? 0;
        const previousValue = prior[key] ?? 0;
        const delta = currentValue - previousValue;
        return {
          key,
          current: currentValue,
          previous: previousValue,
          delta,
          deltaPercent:
            previousValue === 0 ? null : (delta / Math.abs(previousValue)) * 100,
        } satisfies ReportComparisonMetric;
      }),
    };
  }

  private previousRange(from: Date, to: Date) {
    const inclusiveDuration = Math.max(1, to.getTime() - from.getTime() + 1);
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - inclusiveDuration + 1);
    return { from: previousFrom, to: previousTo };
  }

  private numericSummary(result: any): Record<string, number> {
    const source = result?.meta?.summary ?? result?.data ?? {};
    return Object.fromEntries(
      Object.entries(source).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]),
      ),
    );
  }
}
