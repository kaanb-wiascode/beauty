import { z } from 'zod';

export const listAppointmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),

  status: z
    .enum([
      'SCHEDULED',
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ])
    .optional(),

  staffId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),

  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ListAppointmentsInput = z.infer<
  typeof listAppointmentsSchema
>;
