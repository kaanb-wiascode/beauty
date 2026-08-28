import { z } from 'zod';

export const paymentSummarySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export type PaymentSummaryInput = z.infer<
  typeof paymentSummarySchema
>;
