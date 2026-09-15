import { z } from 'zod';

import { reportKeys } from '../report-definition';
import { reportDateRangeSchema } from './report-filters.dto';

export const reportComparisonSchema = z
  .object({
    reportKey: z.enum([
      reportKeys.staffPerformance,
      reportKeys.servicePerformance,
      reportKeys.paymentSummary,
    ]),
    filters: reportDateRangeSchema,
  })
  .strict();

export type ReportComparisonInput = z.infer<typeof reportComparisonSchema>;
