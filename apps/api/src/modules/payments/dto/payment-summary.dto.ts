import {
  reportDateRangeSchema,
  ReportDateRangeInput,
} from '../../reports/dto/report-filters.dto';

export const paymentSummarySchema = reportDateRangeSchema;
export type PaymentSummaryInput = ReportDateRangeInput;
