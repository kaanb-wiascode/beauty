import { z } from 'zod';

import { reportKeys, type ReportKey } from '../report-definition';

const reportKeyValues: readonly [ReportKey, ...ReportKey[]] = [
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
  reportKeys.hrWorkforce,
  reportKeys.payrollSummary,
  reportKeys.branchPerformance,
];

export const reportKeySchema = z.enum(reportKeyValues);
