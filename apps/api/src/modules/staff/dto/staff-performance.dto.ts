import {
  reportDateRangeSchema,
  ReportDateRangeInput,
} from '../../reports/dto/report-filters.dto';

export const staffPerformanceSchema = reportDateRangeSchema;
export type StaffPerformanceInput = ReportDateRangeInput;
