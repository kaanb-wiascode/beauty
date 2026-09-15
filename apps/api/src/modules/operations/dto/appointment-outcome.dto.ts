import { z } from 'zod';

export const appointmentOutcomeTypeSchema = z.enum(['CANCELLED', 'NO_SHOW']);

export const createCancellationReasonSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[A-Z0-9_]+$/),
  label: z.string().trim().min(2).max(160),
  appliesTo: z.enum(['CANCELLED', 'NO_SHOW', 'BOTH']).default('BOTH'),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(100),
  branchSpecific: z.coerce.boolean().default(false),
});

export const recordAppointmentOutcomeSchema = z.object({
  outcome: appointmentOutcomeTypeSchema,
  reasonId: z.string().uuid(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export type CreateCancellationReasonInput = z.infer<typeof createCancellationReasonSchema>;
export type RecordAppointmentOutcomeInput = z.infer<typeof recordAppointmentOutcomeSchema>;
