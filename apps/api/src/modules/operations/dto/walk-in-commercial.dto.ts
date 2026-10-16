import { z } from 'zod';

export const linkWalkInCommercialContextSchema = z.object({
  saleId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().nonnegative().default(0),
  note: z.string().trim().max(2000).optional(),
});

export type LinkWalkInCommercialContextInput = z.infer<typeof linkWalkInCommercialContextSchema>;
