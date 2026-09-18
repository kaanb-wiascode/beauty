import { z } from 'zod';

export const communicationChannelSchema = z.enum(['WHATSAPP', 'SMS', 'EMAIL']);
export const appointmentConfirmationStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'RESCHEDULE_REQUESTED',
  'CANCEL_REQUESTED',
]);

export const sendAppointmentReminderSchema = z.object({
  channel: communicationChannelSchema.default('WHATSAPP'),
  body: z.string().trim().min(1).max(2000).optional(),
});

export const updateAppointmentConfirmationSchema = z.object({
  status: appointmentConfirmationStatusSchema,
  note: z.string().trim().max(1000).nullable().optional(),
  expectedVersion: z.number().int().positive().optional(),
});

export const sendCheckoutFollowupSchema = z.object({
  channel: communicationChannelSchema.default('WHATSAPP'),
  body: z.string().trim().min(1).max(2000).optional(),
});

export type SendAppointmentReminderInput = z.infer<typeof sendAppointmentReminderSchema>;
export type UpdateAppointmentConfirmationInput = z.infer<typeof updateAppointmentConfirmationSchema>;
export type SendCheckoutFollowupInput = z.infer<typeof sendCheckoutFollowupSchema>;
