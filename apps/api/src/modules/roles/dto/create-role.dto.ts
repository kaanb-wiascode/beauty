import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(255).optional(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
