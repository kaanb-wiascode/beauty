import { z } from 'zod';

export const marketingVendorTypeSchema = z.enum([
  'SOCIAL_MEDIA_AGENCY',
  'AD_AGENCY',
  'PRODUCTION',
  'PHOTOGRAPHER',
  'INFLUENCER_AGENCY',
  'FREELANCER',
  'PR_AGENCY',
  'OTHER',
]);

export const marketingVendorStatusSchema = z.enum([
  'ACTIVE',
  'PAUSED',
  'ENDED',
  'BLACKLISTED',
]);

export const marketingVendorPaymentModelSchema = z.enum([
  'MONTHLY_RETAINER',
  'PROJECT',
  'PERFORMANCE',
  'HOURLY',
  'MIXED',
  'OTHER',
]);

const vendorFields = {
  name: z.string().trim().min(2).max(220),
  vendorType: marketingVendorTypeSchema,
  status: marketingVendorStatusSchema.default('ACTIVE'),
  branchId: z.string().uuid().nullable().optional(),
  contactName: z.string().trim().max(180).nullable().optional(),
  contactEmail: z.string().trim().email().max(254).nullable().optional(),
  contactPhone: z.string().trim().max(60).nullable().optional(),
  contractStartsAt: z.coerce.date().nullable().optional(),
  contractEndsAt: z.coerce.date().nullable().optional(),
  serviceScope: z.string().trim().max(8000).nullable().optional(),
  monthlyFee: z.coerce.number().min(0).default(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('TRY'),
  paymentModel: marketingVendorPaymentModelSchema.default('MONTHLY_RETAINER'),
  kpiCommitments: z.record(z.string(), z.unknown()).default({}),
  performanceNotes: z.string().trim().max(8000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
};

export const createMarketingVendorSchema = z.object(vendorFields).refine(
  (value) =>
    !value.contractStartsAt ||
    !value.contractEndsAt ||
    value.contractEndsAt >= value.contractStartsAt,
  { message: 'Contract end date must be after the start date.' },
);

export const updateMarketingVendorSchema = z
  .object({
    name: vendorFields.name.optional(),
    vendorType: vendorFields.vendorType.optional(),
    status: marketingVendorStatusSchema.optional(),
    branchId: vendorFields.branchId,
    contactName: vendorFields.contactName,
    contactEmail: vendorFields.contactEmail,
    contactPhone: vendorFields.contactPhone,
    contractStartsAt: vendorFields.contractStartsAt,
    contractEndsAt: vendorFields.contractEndsAt,
    serviceScope: vendorFields.serviceScope,
    monthlyFee: z.coerce.number().min(0).optional(),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
    paymentModel: marketingVendorPaymentModelSchema.optional(),
    kpiCommitments: z.record(z.string(), z.unknown()).optional(),
    performanceNotes: vendorFields.performanceNotes,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (value) =>
      !value.contractStartsAt ||
      !value.contractEndsAt ||
      value.contractEndsAt >= value.contractStartsAt,
    { message: 'Contract end date must be after the start date.' },
  );

export const listMarketingVendorsSchema = z.object({
  status: marketingVendorStatusSchema.optional(),
  vendorType: marketingVendorTypeSchema.optional(),
  search: z.string().trim().max(180).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type CreateMarketingVendorInput = z.infer<typeof createMarketingVendorSchema>;
export type UpdateMarketingVendorInput = z.infer<typeof updateMarketingVendorSchema>;
