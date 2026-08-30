import { z } from 'zod';

const customerSourceSchema = z.enum([
  'INSTAGRAM',
  'GOOGLE',
  'REFERRAL',
  'WALK_IN',
  'OTHER',
]);

export const createCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(255).optional(),

  birthDate: z.string().date().optional(),
  customerSource: customerSourceSchema.optional(),

  healthProfile: z
    .object({
      allergies: z.string().trim().max(5000).optional(),
      sensitivities: z.string().trim().max(5000).optional(),
      medications: z.string().trim().max(5000).optional(),
      conditions: z.string().trim().max(5000).optional(),
      notes: z.string().trim().max(5000).optional(),
    })
    .optional(),

  consents: z
    .object({
      kvkkAcknowledgement: z.boolean().default(false),
      explicitConsent: z.boolean().default(false),
      membershipAgreement: z.boolean().default(false),
      healthFormCompletion: z.boolean().default(false),
      healthDataConsent: z.boolean().default(false),
      marketingSms: z.boolean().default(false),
      marketingEmail: z.boolean().default(false),
      marketingPhone: z.boolean().default(false),
    })
    .optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
