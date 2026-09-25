import { z } from 'zod';

export const reportDateRangeSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.from > value.to) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'to must be greater than or equal to from',
      });
    }
  });

export type ReportDateRangeInput = z.infer<typeof reportDateRangeSchema>;
