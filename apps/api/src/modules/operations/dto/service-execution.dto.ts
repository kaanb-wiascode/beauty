import { z } from 'zod';

export const startServiceExecutionSchema = z.object({
  appointmentId: z.string().uuid(),
  note: z.string().trim().max(2000).optional(),
});

export const completeServiceExecutionSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  completionNote: z.string().trim().max(4000).optional(),
});

export type StartServiceExecutionInput = z.infer<
  typeof startServiceExecutionSchema
>;
export type CompleteServiceExecutionInput = z.infer<
  typeof completeServiceExecutionSchema
>;
