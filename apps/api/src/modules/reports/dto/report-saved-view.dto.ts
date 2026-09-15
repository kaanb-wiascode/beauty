import { z } from 'zod';

import { reportKeys } from '../report-definition';
import { reportDateRangeSchema } from './report-filters.dto';

const savedReportKeySchema = z.enum([
  reportKeys.staffPerformance,
  reportKeys.servicePerformance,
  reportKeys.paymentSummary,
  reportKeys.customerPerformance,
  reportKeys.salesPerformance,
  reportKeys.appointmentPerformance,
  reportKeys.financePerformance,
  reportKeys.inventoryPerformance,
  reportKeys.procurementPerformance,
]);

const savedSortSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    direction: z.enum(['asc', 'desc']),
  })
  .strict();

export const createReportSavedViewSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    reportKey: savedReportKeySchema,
    filters: reportDateRangeSchema,
    columns: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    sort: savedSortSchema.optional(),
    isFavorite: z.boolean().default(false),
  })
  .strict();

export const updateReportSavedViewSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    filters: reportDateRangeSchema.optional(),
    columns: z.array(z.string().trim().min(1).max(80)).min(1).max(20).optional(),
    sort: savedSortSchema.nullable().optional(),
    isFavorite: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one saved report field must be provided',
  });

export type CreateReportSavedViewInput = z.infer<
  typeof createReportSavedViewSchema
>;
export type UpdateReportSavedViewInput = z.infer<
  typeof updateReportSavedViewSchema
>;
