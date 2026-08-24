import { z } from 'zod';

export const updateCustomerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    {
      message: 'At least one field must be provided',
    },
  );

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
