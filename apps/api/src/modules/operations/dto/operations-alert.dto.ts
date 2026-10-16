import { z } from 'zod';

export const operationsAlertQuerySchema = z.object({
  waitingMinutes: z.coerce.number().int().min(5).max(240).default(15),
  checkoutMinutes: z.coerce.number().int().min(5).max(240).default(15),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type OperationsAlertQuery = z.infer<typeof operationsAlertQuerySchema>;
