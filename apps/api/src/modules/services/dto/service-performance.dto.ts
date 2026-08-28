import { z } from 'zod';

export const servicePerformanceSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export type ServicePerformanceInput = z.infer<
  typeof servicePerformanceSchema
>;
