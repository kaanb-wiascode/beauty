import { z } from 'zod';

export const leadStatusSchema = z.enum([
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'LOST',
  'CONVERTED',
]);

export const opportunityStageSchema = z.enum([
  'QUALIFIED',
  'NEEDS_ANALYSIS',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
]);

export const createLeadSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(3).max(40).optional(),
    email: z.string().trim().email().max(254).optional(),
    source: z.string().trim().min(1).max(60).default('MANUAL'),
    interestNote: z.string().trim().max(2000).optional(),
    ownerUserId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
  })
  .refine((value) => value.phone || value.email, {
    message: 'Lead için telefon veya e-posta gereklidir.',
  });

export const updateLeadSchema = z.object({
  version: z.coerce.number().int().min(1),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().min(3).max(40).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  source: z.string().trim().min(1).max(60).optional(),
  interestNote: z.string().trim().max(2000).nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  status: z.enum(['NEW', 'CONTACTED', 'LOST']).optional(),
  lostReason: z.string().trim().min(1).max(1000).nullable().optional(),
});

export const qualifyLeadSchema = z.object({
  version: z.coerce.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  estimatedValue: z.coerce.number().min(0).optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .default('TRY'),
  probability: z.coerce.number().int().min(0).max(100).default(25),
  expectedCloseDate: z.coerce.date().optional(),
  ownerUserId: z.string().uuid().optional(),
});

export const transitionOpportunitySchema = z.object({
  version: z.coerce.number().int().min(1),
  stage: opportunityStageSchema,
  probability: z.coerce.number().int().min(0).max(100).optional(),
  estimatedValue: z.coerce.number().min(0).nullable().optional(),
  expectedCloseDate: z.coerce.date().nullable().optional(),
  lostReason: z.string().trim().min(1).max(1000).nullable().optional(),
});

export const createFollowUpSchema = z
  .object({
    leadId: z.string().uuid().optional(),
    opportunityId: z.string().uuid().optional(),
    assignedUserId: z.string().uuid(),
    channel: z.enum(['CALL', 'SMS', 'EMAIL', 'WHATSAPP', 'IN_PERSON', 'OTHER']),
    dueAt: z.coerce.date(),
    note: z.string().trim().max(2000).optional(),
  })
  .refine(
    (value) =>
      Number(Boolean(value.leadId)) + Number(Boolean(value.opportunityId)) ===
      1,
    {
      message: 'Takip görevi tam olarak bir lead veya fırsata bağlanmalıdır.',
    },
  );

export const completeFollowUpSchema = z.object({
  version: z.coerce.number().int().min(1),
  outcome: z.string().trim().min(1).max(2000),
});

export const rescheduleFollowUpSchema = z.object({
  version: z.coerce.number().int().min(1),
  dueAt: z.coerce.date(),
  assignedUserId: z.string().uuid().optional(),
  channel: z
    .enum(['CALL', 'SMS', 'EMAIL', 'WHATSAPP', 'IN_PERSON', 'OTHER'])
    .optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const cancelFollowUpSchema = z.object({
  version: z.coerce.number().int().min(1),
  reason: z.string().trim().min(1).max(1000),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type QualifyLeadInput = z.infer<typeof qualifyLeadSchema>;
export type TransitionOpportunityInput = z.infer<
  typeof transitionOpportunitySchema
>;
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
export type CompleteFollowUpInput = z.infer<typeof completeFollowUpSchema>;
export type RescheduleFollowUpInput = z.infer<typeof rescheduleFollowUpSchema>;
export type CancelFollowUpInput = z.infer<typeof cancelFollowUpSchema>;
