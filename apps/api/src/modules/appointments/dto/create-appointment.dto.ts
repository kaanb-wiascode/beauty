import { z } from 'zod';

export const createAppointmentSchema = z.object({
  customerId: z.string().uuid(),
  staffId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
