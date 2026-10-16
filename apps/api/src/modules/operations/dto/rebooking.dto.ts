import { z } from 'zod';

export const upsertRebookingPolicySchema = z.object({
  recommendedIntervalDays: z.coerce.number().int().min(1).max(730).nullable(),
});

export const createRebookingSchema = z.object({
  startAt: z.coerce.date(),
  staffId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type UpsertRebookingPolicyInput = z.infer<
  typeof upsertRebookingPolicySchema
>;
export type CreateRebookingInput = z.infer<typeof createRebookingSchema>;
