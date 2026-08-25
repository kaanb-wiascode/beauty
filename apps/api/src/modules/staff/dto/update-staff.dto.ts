import { z } from 'zod';

export const updateStaffSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().max(50).optional(),
    email: z.string().trim().email().max(255).optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: 'At least one field must be provided',
    },
  );

export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
