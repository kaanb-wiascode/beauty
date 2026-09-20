import { z } from 'zod';

import { reportKeys } from '../report-definition';
import { reportDateRangeSchema } from './report-filters.dto';

const UUID_ROW_ID = z.string().uuid();
const UTC_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isUtcDayRowId(value: string) {
  if (!UTC_DAY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const reportDrilldownSchema = z
  .object({
    reportKey: z.enum([
      reportKeys.staffPerformance,
      reportKeys.servicePerformance,
      reportKeys.customerPerformance,
      reportKeys.salesPerformance,
      reportKeys.appointmentPerformance,
      reportKeys.financePerformance,
      reportKeys.branchPerformance,
    ]),
    dimension: z.enum(['appointments', 'sale', 'finance-records']),
    rowId: z.string().min(1).max(64),
    filters: reportDateRangeSchema,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.reportKey === reportKeys.salesPerformance) {
      if (value.dimension !== 'sale') {
        ctx.addIssue({
          code: 'custom',
          path: ['dimension'],
          message: 'Sales performance supports only sale drilldown',
        });
      }
      if (!UUID_ROW_ID.safeParse(value.rowId).success) {
        ctx.addIssue({
          code: 'custom',
          path: ['rowId'],
          message: 'Sales drilldown rowId must be a UUID',
        });
      }
      return;
    }

    if (value.reportKey === reportKeys.financePerformance) {
      if (value.dimension !== 'finance-records') {
        ctx.addIssue({
          code: 'custom',
          path: ['dimension'],
          message: 'Finance performance supports only finance-records drilldown',
        });
      }
      if (!isUtcDayRowId(value.rowId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rowId'],
          message: 'Finance performance drilldown rowId must be a valid UTC day',
        });
      }
      return;
    }

    if (value.dimension !== 'appointments') {
      ctx.addIssue({
        code: 'custom',
        path: ['dimension'],
        message: 'This report supports only appointment drilldown',
      });
    }

    if (value.reportKey === reportKeys.appointmentPerformance) {
      if (!isUtcDayRowId(value.rowId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rowId'],
          message: 'Appointment performance drilldown rowId must be a valid UTC day',
        });
      }
      return;
    }

    if (!UUID_ROW_ID.safeParse(value.rowId).success) {
      ctx.addIssue({
        code: 'custom',
        path: ['rowId'],
        message: 'Report drilldown rowId must be a UUID',
      });
    }
  });

export type ReportDrilldownInput = z.infer<typeof reportDrilldownSchema>;
