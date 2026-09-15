import { z } from 'zod';

import { reportExportStatuses } from '../report-export-jobs.repository';

export const reportExportListSchema = z
  .object({
    status: z.enum(reportExportStatuses).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type ReportExportListInput = z.infer<typeof reportExportListSchema>;
