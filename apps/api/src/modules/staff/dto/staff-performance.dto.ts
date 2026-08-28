import { z } from 'zod';

export const staffPerformanceSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export type StaffPerformanceInput = z.infer<
  typeof staffPerformanceSchema
>;
