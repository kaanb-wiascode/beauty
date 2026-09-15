import { z } from 'zod';

import { reportKeys } from '../report-definition';
import { reportExportStatuses } from '../report-export-jobs.repository';

export const reportExportListSchema = z.object({
  status: z.enum(reportExportStatuses).optional(),
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
    reportKeys.crmPerformance,
  ]).optional(),
  format: z.enum(['CSV','PDF','XLSX']).optional(),
  mine: z.literal('true').optional().transform(() => true),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type ReportExportListInput = z.infer<typeof reportExportListSchema>;
