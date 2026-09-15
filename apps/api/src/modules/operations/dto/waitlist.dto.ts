import { z } from 'zod';

export const waitlistStatusSchema = z.enum([
  'WAITING',
  'MATCH_FOUND',
  'CONTACTED',
  'BOOKED',
  'EXPIRED',
  'CANCELLED',
]);

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const createWaitlistEntrySchema = z
  .object({
    customerId: z.string().uuid(),
    serviceId: z.string().uuid(),
    preferredStaffId: z.string().uuid().nullable().optional(),
    desiredFrom: z.coerce.date(),
    desiredTo: z.coerce.date(),
    preferredTimeStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    preferredTimeEnd: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    timeZone: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .default('Europe/Istanbul')
      .refine(isValidTimeZone, 'Invalid IANA time zone.'),
    priority: z.coerce.number().int().min(0).max(100).default(50),
    contactChannel: z
      .enum(['ANY', 'PHONE', 'SMS', 'WHATSAPP', 'EMAIL'])
      .default('ANY'),
    note: z.string().trim().max(1000).nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.desiredFrom >= value.desiredTo) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['desiredTo'], message: 'desiredFrom must be before desiredTo.' });
    }
    if (value.preferredTimeStart && value.preferredTimeEnd && value.preferredTimeStart >= value.preferredTimeEnd) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['preferredTimeEnd'], message: 'Preferred start time must be before preferred end time.' });
    }
    if (value.expiresAt && value.expiresAt <= new Date()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'Expiry must be in the future.' });
    }
  });

export const listWaitlistEntriesSchema = z.object({
  status: waitlistStatusSchema.optional(),
  serviceId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const cancelWaitlistEntrySchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const findWaitlistMatchesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const acceptWaitlistMatchSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  staffId: z.string().uuid(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  roomId: z.string().uuid().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
});

export type CreateWaitlistEntryInput = z.infer<typeof createWaitlistEntrySchema>;
export type ListWaitlistEntriesInput = z.infer<typeof listWaitlistEntriesSchema>;
export type CancelWaitlistEntryInput = z.infer<typeof cancelWaitlistEntrySchema>;
export type FindWaitlistMatchesInput = z.infer<typeof findWaitlistMatchesSchema>;
export type AcceptWaitlistMatchInput = z.infer<typeof acceptWaitlistMatchSchema>;
