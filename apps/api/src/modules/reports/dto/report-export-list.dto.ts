import { z } from 'zod';

import { reportKeys } from '../report-definition';
import { reportExportStatuses } from '../report-export-jobs.repository';

export const reportExportListSchema = z
  .object({
    status: z.enum(reportExportStatuses).optional(),
    reportKey: z
      .enum([
        reportKeys.staffPerformance,
        reportKeys.servicePerformance,
        reportKeys.paymentSummary,
      ])
      .optional(),
    format: z.enum(['CSV', 'PDF', 'XLSX']).optional(),
    mine: z
      .union([z.literal('true'), z.literal('false')])
      .transform((value) => value === 'true')
      .default(false),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type ReportExportListInput = z.infer<typeof reportExportListSchema>;
