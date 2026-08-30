import { z } from 'zod';

export const updateHealthProfileSchema = z.object({
  allergies: z.string().trim().max(5000).nullable().optional(),
  sensitivities: z.string().trim().max(5000).nullable().optional(),
  medications: z.string().trim().max(5000).nullable().optional(),
  conditions: z.string().trim().max(5000).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

export type UpdateHealthProfileInput = z.infer<
  typeof updateHealthProfileSchema
>;
