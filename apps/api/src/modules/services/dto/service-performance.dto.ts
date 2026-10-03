import {
  reportDateRangeSchema,
  ReportDateRangeInput,
} from '../../reports/dto/report-filters.dto';

export const servicePerformanceSchema = reportDateRangeSchema;
export type ServicePerformanceInput = ReportDateRangeInput;
