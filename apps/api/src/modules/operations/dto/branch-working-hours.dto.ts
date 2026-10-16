import { z } from 'zod';

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);

export const updateBranchWorkingHoursSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  isClosed: z.coerce.boolean().default(false),
  opensAt: timeSchema.nullish(),
  closesAt: timeSchema.nullish(),
  crossesMidnight: z.coerce.boolean().default(false),
  timeZone: z.string().trim().min(1).max(100).default('Europe/Istanbul'),
  expectedVersion: z.coerce.number().int().min(0).default(0),
}).superRefine((value, ctx) => {
  if (value.isClosed) {
    return;
  }
  if (!value.opensAt || !value.closesAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'opensAt and closesAt are required when the branch is open.' });
  }
  if (!value.crossesMidnight && value.opensAt && value.closesAt && value.opensAt >= value.closesAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'opensAt must be before closesAt unless crossesMidnight is enabled.' });
  }
});

export const branchWorkingHoursCheckSchema = z.object({
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});

export type UpdateBranchWorkingHoursInput = z.infer<typeof updateBranchWorkingHoursSchema>;
export type BranchWorkingHoursCheckInput = z.infer<typeof branchWorkingHoursCheckSchema>;
