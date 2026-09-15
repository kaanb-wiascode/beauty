import { z } from 'zod';

import { reportKeys } from '../report-definition';

export const reportScheduleFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export const reportScheduleDatePresets = [
  'TODAY',
  'YESTERDAY',
  'LAST_7_DAYS',
  'LAST_30_DAYS',
  'THIS_MONTH',
  'PREVIOUS_MONTH',
] as const;

const reportKeySchema = z.enum([
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

const sortSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    direction: z.enum(['asc', 'desc']),
  })
  .strict();

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }, 'Invalid IANA timezone');

export const createReportScheduleSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    reportKey: reportKeySchema,
    frequency: z.enum(reportScheduleFrequencies),
    timezone: timezoneSchema,
    localHour: z.number().int().min(0).max(23),
    localMinute: z.number().int().min(0).max(59),
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
    format: z.enum(['CSV', 'XLSX', 'PDF']),
    datePreset: z.enum(reportScheduleDatePresets),
    columns: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    sort: sortSchema.optional(),
    includeSummary: z.boolean().default(true),
    enabled: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.frequency === 'DAILY' && (value.dayOfWeek || value.dayOfMonth)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Daily schedules cannot define a weekday or month day' });
    }
    if (value.frequency === 'WEEKLY' && (!value.dayOfWeek || value.dayOfMonth)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Weekly schedules require only dayOfWeek' });
    }
    if (value.frequency === 'MONTHLY' && (!value.dayOfMonth || value.dayOfWeek)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Monthly schedules require only dayOfMonth' });
    }
  });

export const updateReportScheduleSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one scheduled report field must be provided',
  });

export type ReportScheduleDatePreset = (typeof reportScheduleDatePresets)[number];
export type CreateReportScheduleInput = z.infer<typeof createReportScheduleSchema>;
export type UpdateReportScheduleInput = z.infer<typeof updateReportScheduleSchema>;
