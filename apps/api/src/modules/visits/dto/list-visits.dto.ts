import { z } from 'zod';

import { VISIT_STATUSES } from '../visit-lifecycle';

export const listVisitsSchema = z.object({
  status: z.enum(VISIT_STATUSES).optional(),
  customerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type ListVisitsInput = z.infer<typeof listVisitsSchema>;
