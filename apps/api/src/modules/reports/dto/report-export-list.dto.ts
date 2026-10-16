import { z } from 'zod';

import { reportExportStatuses } from '../report-export-jobs.repository';
import { reportKeySchema } from './report-key.schema';

export const reportExportListSchema = z
  .object({
    status: z.enum(reportExportStatuses).optional(),
    reportKey: reportKeySchema.optional(),
    format: z.enum(['CSV', 'PDF', 'XLSX']).optional(),
    mine: z
      .literal('true')
      .optional()
      .transform(() => true),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type ReportExportListInput = z.infer<typeof reportExportListSchema>;
