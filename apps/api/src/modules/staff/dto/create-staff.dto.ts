import { z } from 'zod';

export const createStaffSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(255).optional(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
