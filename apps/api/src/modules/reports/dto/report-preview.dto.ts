import { z } from 'zod';

import { reportDateRangeSchema } from './report-filters.dto';
import { reportKeySchema } from './report-key.schema';

export const reportPreviewSchema = z
  .object({
    reportKey: reportKeySchema,
    filters: reportDateRangeSchema,
    columns: z.array(z.string().min(1)).max(20).optional(),
    sort: z
      .object({ key: z.string().min(1), direction: z.enum(['asc', 'desc']) })
      .strict()
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type ReportPreviewInput = z.infer<typeof reportPreviewSchema>;
