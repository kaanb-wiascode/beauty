import { z } from 'zod';

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().max(100).optional(),
  description: z.string().trim().max(1000).optional(),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
  preparationMinutes: z.coerce.number().int().min(0).max(240).default(0),
  cleanupMinutes: z.coerce.number().int().min(0).max(240).default(0),
  price: z.coerce.number().min(0),
  cost: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).max(100).default(20),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('TRY'),
  requiresConsultation: z.coerce.boolean().default(false),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
