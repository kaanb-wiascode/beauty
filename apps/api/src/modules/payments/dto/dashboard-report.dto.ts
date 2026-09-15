import {
  reportDateRangeSchema,
  ReportDateRangeInput,
} from '../../reports/dto/report-filters.dto';

export const dashboardReportSchema = reportDateRangeSchema;
export type DashboardReportInput = ReportDateRangeInput;
