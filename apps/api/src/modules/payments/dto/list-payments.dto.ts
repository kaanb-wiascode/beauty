import { z } from 'zod';

export const listPaymentsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  method: z
    .enum(['CASH', 'CARD', 'TRANSFER'])
    .optional(),
});

export type ListPaymentsInput = z.infer<
  typeof listPaymentsSchema
>;
