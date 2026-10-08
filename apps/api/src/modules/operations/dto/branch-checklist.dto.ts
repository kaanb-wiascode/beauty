import { z } from 'zod';

export const branchChecklistCategorySchema = z.enum(['OPENING', 'CLOSING']);

const templateItemSchema = z.object({
  code: z.string().trim().min(1).max(80).regex(/^[A-Z0-9_-]+$/),
  title: z.string().trim().min(1).max(240),
  isRequired: z.boolean().default(true),
});

export const publishBranchChecklistTemplateSchema = z.object({
  category: branchChecklistCategorySchema,
  name: z.string().trim().min(1).max(160),
  branchId: z.string().uuid().nullable().optional(),
  items: z.array(templateItemSchema).min(1).max(100),
}).superRefine((value, ctx) => {
  const codes = new Set<string>();
  for (const [index, item] of value.items.entries()) {
    if (codes.has(item.code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items', index, 'code'],
        message: 'Checklist item codes must be unique.',
      });
    }
    codes.add(item.code);
  }
});

export const listBranchChecklistTemplatesSchema = z.object({
  category: branchChecklistCategorySchema.optional(),
});

export const startBranchChecklistRunSchema = z.object({
  category: branchChecklistCategorySchema,
  businessDate: z.coerce.date(),
});

export const listBranchChecklistRunsSchema = z.object({
  category: branchChecklistCategorySchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const updateBranchChecklistRunItemSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  status: z.enum(['COMPLETED', 'NA']),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const completeBranchChecklistRunSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
});

export type PublishBranchChecklistTemplateInput = z.infer<typeof publishBranchChecklistTemplateSchema>;
export type ListBranchChecklistTemplatesInput = z.infer<typeof listBranchChecklistTemplatesSchema>;
export type StartBranchChecklistRunInput = z.infer<typeof startBranchChecklistRunSchema>;
export type ListBranchChecklistRunsInput = z.infer<typeof listBranchChecklistRunsSchema>;
export type UpdateBranchChecklistRunItemInput = z.infer<typeof updateBranchChecklistRunItemSchema>;
export type CompleteBranchChecklistRunInput = z.infer<typeof completeBranchChecklistRunSchema>;
