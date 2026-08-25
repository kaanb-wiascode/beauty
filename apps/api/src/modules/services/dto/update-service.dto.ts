import { z } from 'zod';

export const updateServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(1000).optional(),
    durationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
    price: z.coerce.number().min(0).optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: 'At least one field must be provided',
    },
  );

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
