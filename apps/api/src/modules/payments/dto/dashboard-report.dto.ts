import { z } from 'zod';

export const dashboardReportSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export type DashboardReportInput = z.infer<
  typeof dashboardReportSchema
>;
