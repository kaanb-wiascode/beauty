import { z } from 'zod';

const quoteItemSchema = z.object({
  itemType: z.enum(['SERVICE','PACKAGE','CUSTOM']),
  referenceId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().int().min(1).max(1000),
  unitPrice: z.coerce.number().min(0),
});

export const createCrmQuoteSchema = z.object({
  opportunityId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
  currency: z.string().trim().length(3).default('TRY').transform((value) => value.toUpperCase()),
  discountTotal: z.coerce.number().min(0).default(0),
  validUntil: z.coerce.date().optional(),
  notes: z.string().trim().max(4000).optional(),
  items: z.array(quoteItemSchema).min(1).max(100),
});

export const updateCrmQuoteStatusSchema = z.object({
  version: z.coerce.number().int().min(1),
  status: z.enum(['SENT','VIEWED','ACCEPTED','REJECTED','EXPIRED','CANCELLED']),
});

export type CreateCrmQuoteInput = z.infer<typeof createCrmQuoteSchema>;
export type UpdateCrmQuoteStatusInput = z.infer<typeof updateCrmQuoteStatusSchema>;
