import { z } from 'zod';

import { reportKeys } from '../report-definition';
import { reportDateRangeSchema } from './report-filters.dto';

export const reportDrilldownSchema = z
  .object({
    reportKey: z.enum([
      reportKeys.staffPerformance,
      reportKeys.servicePerformance,
      reportKeys.branchPerformance,
    ]),
    dimension: z.literal('appointments'),
    rowId: z.string().uuid(),
    filters: reportDateRangeSchema,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type ReportDrilldownInput = z.infer<typeof reportDrilldownSchema>;
