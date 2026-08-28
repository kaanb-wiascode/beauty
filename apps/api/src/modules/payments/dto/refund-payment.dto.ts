import { z } from 'zod';

export const refundPaymentSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type RefundPaymentInput = z.infer<
  typeof refundPaymentSchema
>;
