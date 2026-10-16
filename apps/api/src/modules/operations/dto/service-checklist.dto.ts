import { z } from 'zod';

const serviceChecklistItemSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'Checklist item code must be uppercase.'),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(1000).nullable().optional(),
  isRequired: z.boolean().default(true),
});

export const createServiceChecklistTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    items: z.array(serviceChecklistItemSchema).min(1).max(100),
  })
  .superRefine((value, ctx) => {
    const codes = new Set<string>();
    value.items.forEach((item, index) => {
      if (codes.has(item.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'code'],
          message: 'Checklist item codes must be unique.',
        });
      }
      codes.add(item.code);
    });
  });

export const updateExecutionChecklistItemSchema = z.object({
  status: z.enum(['COMPLETED', 'NA']),
  note: z.string().trim().max(1000).nullable().optional(),
  expectedVersion: z.coerce.number().int().positive(),
});

export type CreateServiceChecklistTemplateInput = z.infer<
  typeof createServiceChecklistTemplateSchema
>;
export type UpdateExecutionChecklistItemInput = z.infer<
  typeof updateExecutionChecklistItemSchema
>;
