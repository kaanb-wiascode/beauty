import { z } from 'zod';

export const updateRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid()).default([]),
});

export type UpdateRolePermissionsInput =
  z.infer<typeof updateRolePermissionsSchema>;
