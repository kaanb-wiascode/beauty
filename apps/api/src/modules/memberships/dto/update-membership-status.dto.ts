import { z } from 'zod';

export const updateMembershipStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export type UpdateMembershipStatusInput =
  z.infer<typeof updateMembershipStatusSchema>;
