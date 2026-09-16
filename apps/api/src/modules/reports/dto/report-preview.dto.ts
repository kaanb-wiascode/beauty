import { z } from 'zod';

import { reportDateRangeSchema } from './report-filters.dto';
import { reportKeys } from '../report-definition';

export const reportPreviewSchema = z.object({
  reportKey: z.enum([
    reportKeys.staffPerformance, reportKeys.servicePerformance, reportKeys.paymentSummary,
    reportKeys.customerPerformance, reportKeys.salesPerformance, reportKeys.appointmentPerformance,
    reportKeys.financePerformance, reportKeys.inventoryPerformance, reportKeys.procurementPerformance,
    reportKeys.crmPerformance, reportKeys.hrWorkforce, reportKeys.payrollSummary,
  ]),
  filters: reportDateRangeSchema,
  columns: z.array(z.string().min(1)).max(20).optional(),
  sort: z.object({ key: z.string().min(1), direction: z.enum(['asc','desc']) }).strict().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type ReportPreviewInput = z.infer<typeof reportPreviewSchema>;
