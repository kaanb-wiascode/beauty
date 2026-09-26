import { z } from 'zod';

export const updateStaffEligibilityPolicySchema = z.object({
  mode: z.enum(['OFF', 'WARN', 'BLOCK']),
  requirePublishedShift: z.boolean().default(true),
  requireServiceCertification: z.boolean().default(true),
  requireCompetency: z.boolean().default(true),
  expectedVersion: z.number().int().positive().optional(),
});

export const staffEligibilityCheckSchema = z.object({
  staffId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
}).refine((value) => value.endAt > value.startAt, {
  message: 'endAt must be after startAt',
  path: ['endAt'],
});

export type UpdateStaffEligibilityPolicyInput = z.infer<typeof updateStaffEligibilityPolicySchema>;
export type StaffEligibilityCheckInput = z.infer<typeof staffEligibilityCheckSchema>;
