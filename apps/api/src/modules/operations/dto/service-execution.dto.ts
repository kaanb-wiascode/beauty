import { z } from 'zod';

export const startServiceExecutionSchema = z.object({
  appointmentId: z.string().uuid(),
  note: z.string().trim().max(2000).optional(),
});

export const completeServiceExecutionSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  completionNote: z.string().trim().max(4000).optional(),
});

export const addExecutionStaffSchema = z.object({
  staffId: z.string().uuid(),
  role: z.enum(['ASSISTANT', 'HANDOFF']).default('ASSISTANT'),
  note: z.string().trim().max(2000).optional(),
});

export const endExecutionStaffSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  note: z.string().trim().max(2000).optional(),
});

export const handoffExecutionStaffSchema = z.object({
  fromAssignmentId: z.string().uuid(),
  toStaffId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  note: z.string().trim().max(2000).optional(),
});

export type StartServiceExecutionInput = z.infer<
  typeof startServiceExecutionSchema
>;
export type CompleteServiceExecutionInput = z.infer<
  typeof completeServiceExecutionSchema
>;
export type AddExecutionStaffInput = z.infer<typeof addExecutionStaffSchema>;
export type EndExecutionStaffInput = z.infer<typeof endExecutionStaffSchema>;
export type HandoffExecutionStaffInput = z.infer<typeof handoffExecutionStaffSchema>;
