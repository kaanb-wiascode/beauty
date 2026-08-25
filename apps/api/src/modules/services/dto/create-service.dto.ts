import { z } from 'zod';

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).optional(),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
  price: z.coerce.number().min(0),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
