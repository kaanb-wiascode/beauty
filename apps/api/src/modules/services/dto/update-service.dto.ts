import { z } from 'zod';

export const updateServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    category: z.string().trim().max(100).nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    durationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
    preparationMinutes: z.coerce.number().int().min(0).max(240).optional(),
    cleanupMinutes: z.coerce.number().int().min(0).max(240).optional(),
    price: z.coerce.number().min(0).optional(),
    cost: z.coerce.number().min(0).nullable().optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
    requiresConsultation: z.coerce.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: 'At least one field must be provided',
    },
  );

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
