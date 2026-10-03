import { z } from 'zod';

const reasonCode = z.string().trim().min(2).max(64).regex(/^[A-Z0-9_]+$/);
const reasonLabel = z.string().trim().min(3).max(200);
const note = z.string().trim().max(2000).optional();

export const cancelServiceExecutionSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  reasonCode,
  reasonLabel,
  note,
});

export const reverseServiceExecutionCompletionSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  reasonCode,
  reasonLabel,
  note,
});

export type CancelServiceExecutionInput = z.infer<typeof cancelServiceExecutionSchema>;
export type ReverseServiceExecutionCompletionInput = z.infer<typeof reverseServiceExecutionCompletionSchema>;
