import { z } from 'zod';

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((value) => value || undefined).optional();

export const demoRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  companyName: z.string().trim().min(2).max(180),
  role: optionalText(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(40),
  businessType: optionalText(120),
  branchCount: z.coerce.number().int().min(1).max(5000).default(1),
  employeeCount: z.coerce.number().int().min(1).max(100000).optional(),
  currentTools: optionalText(500),
  goal: optionalText(1500),
  privacyNoticeAccepted: z.literal(true),
  commercialConsent: z.boolean().default(false),
  website: z.string().trim().max(0).optional(),
  pageUrl: z.string().trim().url().max(2048).optional(),
  referrer: z.string().trim().url().max(2048).optional(),
  utmSource: optionalText(240),
  utmMedium: optionalText(240),
  utmCampaign: optionalText(240),
  utmContent: optionalText(240),
  utmTerm: optionalText(240),
});

export type DemoRequestInput = z.infer<typeof demoRequestSchema>;
