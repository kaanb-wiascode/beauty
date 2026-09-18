import { z } from 'zod';

export const checkInVisitSchema = z
  .object({
    appointmentId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    const hasAppointment = Boolean(value.appointmentId);
    const hasCustomer = Boolean(value.customerId);

    if (hasAppointment === hasCustomer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of appointmentId or customerId.',
      });
    }

    if (hasCustomer && !value.idempotencyKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['idempotencyKey'],
        message: 'idempotencyKey is required for walk-in check-in.',
      });
    }
  });

export type CheckInVisitInput = z.infer<typeof checkInVisitSchema>;
