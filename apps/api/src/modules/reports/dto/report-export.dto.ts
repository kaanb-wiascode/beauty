import { z } from 'zod';

import { reportDateRangeSchema } from './report-filters.dto';
import { reportKeys } from '../report-definition';

export const reportExportSchema = z
  .object({
    reportKey: z.enum([
      reportKeys.staffPerformance,
      reportKeys.servicePerformance,
      reportKeys.paymentSummary,
      reportKeys.customerPerformance,
      reportKeys.salesPerformance,
      reportKeys.appointmentPerformance,
      reportKeys.financePerformance,
      reportKeys.inventoryPerformance,
      reportKeys.procurementPerformance,
    ]),
    format: z.enum(['PDF', 'XLSX', 'CSV']),
    filters: reportDateRangeSchema,
    columns: z.array(z.string().min(1)).max(20).optional(),
    columnMode: z.enum(['VISIBLE', 'ALL_PERMITTED']).optional(),
    sort: z
      .object({
        key: z.string().min(1),
        direction: z.enum(['asc', 'desc']),
      })
      .strict()
      .optional(),
    includeSummary: z.boolean().default(true),
    includeCharts: z.boolean().default(false),
  })
  .strict();

export type ReportExportInput = z.infer<typeof reportExportSchema>;
