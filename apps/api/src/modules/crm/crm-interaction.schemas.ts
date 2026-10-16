import { z } from 'zod';

export const crmInteractionTypeSchema = z.enum([
  'CALL',
  'WHATSAPP',
  'SMS',
  'EMAIL',
  'IN_PERSON',
  'VIDEO_CALL',
  'OTHER',
]);

export const crmInteractionDirectionSchema = z.enum(['INBOUND', 'OUTBOUND']);
export const crmInteractionStatusSchema = z.enum(['PLANNED', 'COMPLETED', 'CANCELLED']);
export const crmInteractionOutcomeSchema = z.enum([
  'REACHED',
  'NOT_REACHED',
  'INTERESTED',
  'UNDECIDED',
  'AWAITING_QUOTE',
  'APPOINTMENT_CREATED',
  'CALLBACK',
  'SALE',
  'NOT_INTERESTED',
  'OTHER',
]);

export const createCrmInteractionSchema = z.object({
  customerId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
  type: crmInteractionTypeSchema,
  direction: crmInteractionDirectionSchema,
  status: crmInteractionStatusSchema.default('COMPLETED'),
  outcomeCode: crmInteractionOutcomeSchema.optional(),
  result: z.string().trim().min(1).max(500).optional(),
  notes: z.string().trim().max(4000).optional(),
  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().optional(),
  durationSeconds: z.coerce.number().int().min(0).optional(),
  nextAction: z.string().trim().min(1).max(500).optional(),
  nextActionAt: z.coerce.date().optional(),
}).refine(
  (value) => Boolean(value.customerId || value.leadId || value.opportunityId),
  { message: 'Görüşme en az bir müşteri, potansiyel müşteri veya satış fırsatına bağlanmalıdır.' },
).refine(
  (value) => !value.endedAt || !value.startedAt || value.endedAt >= value.startedAt,
  { message: 'Görüşme bitiş zamanı başlangıç zamanından önce olamaz.', path: ['endedAt'] },
);

export const listCrmInteractionsSchema = z.object({
  ownerUserId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  type: crmInteractionTypeSchema.optional(),
  direction: crmInteractionDirectionSchema.optional(),
  status: crmInteractionStatusSchema.optional(),
  outcomeCode: crmInteractionOutcomeSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).refine(
  (value) => !value.from || !value.to || value.to >= value.from,
  { message: 'Bitiş tarihi başlangıç tarihinden önce olamaz.', path: ['to'] },
);

export type CreateCrmInteractionInput = z.infer<typeof createCrmInteractionSchema>;
export type ListCrmInteractionsInput = z.infer<typeof listCrmInteractionsSchema>;
