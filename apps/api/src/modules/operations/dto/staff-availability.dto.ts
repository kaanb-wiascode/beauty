import { z } from 'zod';

export const staffAvailabilityQuerySchema = z.object({
  at: z.coerce.date().default(() => new Date()),
});

export type StaffAvailabilityQueryInput = z.infer<
  typeof staffAvailabilityQuerySchema
>;
