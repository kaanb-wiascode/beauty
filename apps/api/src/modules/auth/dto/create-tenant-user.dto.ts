import { z } from 'zod';

export const createTenantUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  roleId: z.string().uuid(),
});

export type CreateTenantUserInput =
  z.infer<typeof createTenantUserSchema>;
