import { z } from 'zod';

export const createPaymentSchema = z.object({
  appointmentId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  paidAt: z.coerce.date().optional(),
});

export type CreatePaymentInput = z.infer<
  typeof createPaymentSchema
>;
