import { z } from 'zod';

import { reportDateRangeSchema } from './report-filters.dto';
import { reportKeySchema } from './report-key.schema';

export const reportComparisonSchema = z
  .object({
    reportKey: reportKeySchema,
    filters: reportDateRangeSchema,
  })
  .strict();

export type ReportComparisonInput = z.infer<typeof reportComparisonSchema>;
