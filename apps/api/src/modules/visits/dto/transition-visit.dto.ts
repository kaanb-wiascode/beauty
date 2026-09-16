import { z } from 'zod';

import { VISIT_STATUSES } from '../visit-lifecycle';

export const transitionVisitSchema = z.object({
  toStatus: z.enum(VISIT_STATUSES),
  expectedVersion: z.coerce.number().int().positive(),
  note: z.string().trim().max(2000).optional(),
});

export const checkOutVisitSchema = transitionVisitSchema
  .omit({ toStatus: true })
  .extend({});

export type TransitionVisitInput = z.infer<typeof transitionVisitSchema>;
export type CheckOutVisitInput = z.infer<typeof checkOutVisitSchema>;
