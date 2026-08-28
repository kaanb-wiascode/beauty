import { z } from 'zod';

export const updateMembershipRoleSchema = z.object({
  roleId: z.string().uuid(),
});

export type UpdateMembershipRoleInput =
  z.infer<typeof updateMembershipRoleSchema>;
