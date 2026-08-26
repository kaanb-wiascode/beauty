import { z } from 'zod';

export const updateAppointmentSchema = z
  .object({
    customerId: z.string().uuid().optional(),
    staffId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    notes: z.string().trim().max(2000).optional(),
    status: z
      .enum([
        'SCHEDULED',
        'CONFIRMED',
        'COMPLETED',
        'CANCELLED',
        'NO_SHOW',
      ])
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
