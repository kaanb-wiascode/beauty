import { z } from 'zod';

const uuid = z.string().uuid();
const optionalNote = z.string().trim().max(2000).nullable().optional();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD biçiminde olmalıdır.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value;
  }, 'Geçersiz takvim tarihi.');

const money = z.coerce.number().finite().min(0).max(100_000_000);
const positivePayment = z.coerce.number().finite().positive().max(100_000_000);
const status = z.string().trim().min(1).max(40);

export const createLeaveSchema = z
  .object({
    id: z.string().trim().min(1).max(128).optional(),
    staffId: uuid,
    branchId: uuid.optional(),
    leaveType: status.default('ANNUAL'),
    startDate: date,
    endDate: date,
    days: z.coerce.number().finite().positive().max(366).default(1),
    status: status.default('PENDING'),
    reason: optionalNote,
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: 'Bitiş tarihi başlangıç tarihinden önce olamaz.',
    path: ['endDate'],
  });

export const updateLeaveSchema = z
  .object({
    leaveType: status.optional(),
    startDate: date.optional(),
    endDate: date.optional(),
    days: z.coerce.number().finite().positive().max(366).optional(),
    status: status.optional(),
    reason: optionalNote,
    approvedBy: uuid.nullable().optional(),
  })
  .refine(
    (value) => !value.startDate || !value.endDate || value.startDate <= value.endDate,
    { message: 'Bitiş tarihi başlangıç tarihinden önce olamaz.', path: ['endDate'] },
  );

export const createSgkSchema = z.object({
  id: z.string().trim().min(1).max(128).optional(),
  staffId: uuid,
  branchId: uuid.optional(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  employeeAmount: money.default(0),
  employerAmount: money.default(0),
  status: status.default('PENDING'),
  dueDate: date.nullable().optional(),
  note: optionalNote,
});

const paymentMethod = z.enum(['CASH', 'BANK']);
const paymentFields = {
  amount: positivePayment,
  method: paymentMethod.default('BANK'),
  note: optionalNote,
};

export const payQueueItemSchema = z.object({
  ...paymentFields,
  amount: positivePayment.optional(),
});
export const salaryPaymentSchema = z.object({
  ...paymentFields,
  staffId: uuid,
});
export const legacySalaryPaymentSchema = z.object({
  ...paymentFields,
  periodId: uuid,
  staffId: uuid,
});
export const settleLiabilitySchema = z.object({
  ...paymentFields,
  type: z.enum(['TAX', 'SOCIAL_SECURITY', 'OTHER']),
});
export const paymentReversalSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const periodQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export const requiredPeriodQuerySchema = z.object({
  // PayrollPeriodService accepts 2000..2200 (also used by distant-future e2e periods).
  year: z.coerce.number().int().min(2000).max(2200),
  month: z.coerce.number().int().min(1).max(12),
});

export const yearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const dateQuerySchema = z.object({
  asOf: date,
});

export const salaryContractSchema = z
  .object({
    effectiveFrom: date,
    effectiveTo: date.nullable().optional(),
    netAmount: positivePayment,
    salaryBasis: z.string().trim().max(40).optional(),
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional(),
    note: optionalNote,
  })
  .refine((value) => !value.effectiveTo || value.effectiveFrom <= value.effectiveTo, {
    path: ['effectiveTo'],
    message: 'Sözleşme bitişi başlangıçtan önce olamaz.',
  });

export const salaryContractEndSchema = z.object({ effectiveTo: date });

export const assetAssignmentSchema = z.object({
  assetId: uuid,
  note: z.string().trim().max(1000).optional(),
});

export const assetReturnSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

export const payrollReversalSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});

export const netToGrossSchema = z.object({
  targetNet: positivePayment,
  asOf: date,
  cumulativeTaxBaseBefore: money.default(0),
  otherDeductions: money.default(0),
});

export const taxBaseOpeningSchema = z.object({
  taxYear: z.coerce.number().int().min(2000).max(2100),
  cumulativeTaxBase: money,
  sourceReference: z.string().trim().max(200).nullable().optional(),
  note: optionalNote,
});

const optionalUuid = uuid.nullable().optional();
const optionalDate = date.nullable().optional();
const shortText = z.string().trim().min(1).max(160);
const nullableText = z.string().trim().max(2000).nullable().optional();

export const compensationRequestSchema = z.object({
  staffId: uuid,
  type: z.preprocess((value) => typeof value === 'string' ? value.trim().toUpperCase() : value, z.enum(['BONUS', 'COMMISSION'])),
  amount: positivePayment,
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  reason: z.string().trim().min(3).max(2000),
});

export const updateCompensationRequestSchema = z.object({
  amount: positivePayment.optional(),
  reason: z.string().trim().min(3).max(2000).optional(),
});

export const employeeCreateSchema = z.object({
  firstName: shortText,
  lastName: shortText,
  email: z.string().trim().email().max(254),
  roleId: uuid,
  branchId: uuid.optional(),
  departmentId: optionalUuid,
  teamId: optionalUuid,
  positionId: optionalUuid,
  managerStaffId: optionalUuid,
  department: nullableText,
  position: nullableText,
  phone: nullableText,
  status: status.optional(),
  personnelNumber: nullableText,
  identityNumber: nullableText,
  dateOfBirth: z.union([date, z.literal(''), z.null()]).optional(),
  personalEmail: nullableText,
  address: nullableText,
  employmentType: nullableText,
  hireDate: z.union([date, z.literal(''), z.null()]).optional(),
  terminationDate: z.union([date, z.literal(''), z.null()]).optional(),
  bankName: nullableText,
  iban: nullableText,
}).passthrough();

export const employeeUpdateSchema = employeeCreateSchema.partial();

export const employmentHistorySchema = z.object({
  eventType: status.optional(),
  effectiveFrom: optionalDate,
  branchId: uuid.optional(),
  grossSalary: money.nullable().optional(),
  employmentType: nullableText,
  costCenterId: optionalUuid,
}).passthrough();

const onboardingTask = z.union([
  z.string().trim().min(1).max(200),
  z.object({ title: z.string().trim().min(1).max(200) }).passthrough(),
]);
const normalizeUppercase = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const taskStatus = z.preprocess(
  normalizeUppercase,
  z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED']),
);

export const onboardingSchema = z.object({
  name: shortText.optional(),
  startedAt: optionalDate,
  targetCompletionDate: optionalDate,
  tasks: z.array(onboardingTask).min(1).max(200).optional(),
}).passthrough();

export const onboardingTaskSchema = z.object({
  status: taskStatus,
  completionNote: nullableText,
  dueDate: optionalDate,
  ownerStaffId: optionalUuid,
}).passthrough();

export const probationStartSchema = z.object({
  startedAt: optionalDate,
  endAt: optionalDate,
  reviewerStaffId: optionalUuid,
}).passthrough();

export const probationReviewSchema = z.object({
  status: z.preprocess(normalizeUppercase, z.enum(['COMPLETED', 'SKIPPED'])).default('COMPLETED'),
  rating: z.coerce.number().finite().min(0).max(5).nullable().optional(),
  managerNote: nullableText,
  strengths: nullableText,
  developmentAreas: nullableText,
}).passthrough();

export const probationDecisionSchema = z.object({
  decision: z.preprocess(normalizeUppercase, z.enum(['CONFIRMED', 'EXTENDED', 'TERMINATED'])),
  endAt: optionalDate,
  note: nullableText,
  forceDecision: z.boolean().optional(),
  terminationDate: optionalDate,
}).passthrough();

export const offboardingSchema = z.object({
  terminationDate: date,
  reason: z.string().trim().min(1).max(2000),
}).passthrough();

export const offboardingTaskSchema = z.object({
  status: taskStatus,
  completionNote: nullableText,
  ownerStaffId: optionalUuid,
}).passthrough();

const organizationStatus = status.optional();
const organizationCode = z.string().trim().min(1).max(80);

export const createDepartmentSchema = z.object({
  companyId: uuid.optional(),
  code: organizationCode,
  name: shortText,
  status: organizationStatus,
}).passthrough();

export const createTeamSchema = z.object({
  departmentId: uuid,
  code: organizationCode,
  name: shortText,
  status: organizationStatus,
}).passthrough();

export const createPositionSchema = z.object({
  companyId: uuid.optional(),
  departmentId: optionalUuid,
  parentPositionId: optionalUuid,
  code: organizationCode,
  name: shortText,
  status: organizationStatus,
}).passthrough();

export const employeeAssignmentSchema = z.object({
  branchId: uuid.optional(),
  departmentId: optionalUuid,
  teamId: optionalUuid,
  positionId: optionalUuid,
  managerStaffId: optionalUuid,
  effectiveFrom: optionalDate,
}).passthrough();

export const payrollPolicySchema = z.object({
  enabled: z.boolean(),
  applyOvertime: z.boolean(),
  applyUnpaidLeaveDeduction: z.boolean(),
  standardMonthlyMinutes: z.coerce.number().finite().positive().max(100_000).nullable().optional(),
  overtimeMultiplier: z.coerce.number().finite().min(0).max(100).nullable().optional(),
  monthlyDayDivisor: z.coerce.number().finite().positive().max(366).nullable().optional(),
});

const rate = z.coerce.number().finite().min(0).max(1);
const legalParamsSchema = z.object({
  employeeSocialSecurityRate: rate,
  unemploymentEmployeeRate: rate,
  employerSocialSecurityRate: rate,
  unemploymentEmployerRate: rate,
  stampTaxRate: rate,
  incomeTaxBrackets: z.array(z.object({
    upTo: money.nullable().optional(),
    rate,
  })).min(1).max(100),
  minimumWageIncomeTaxExemption: money.optional(),
  minimumWageStampTaxExemption: money.optional(),
  socialSecurityBaseFloor: money.nullable().optional(),
  socialSecurityBaseCeiling: money.nullable().optional(),
}).passthrough();

export const payrollLegalVersionSchema = z.object({
  versionLabel: shortText,
  effectiveFrom: date,
  effectiveTo: optionalDate,
  jurisdiction: z.string().trim().max(80).optional(),
  sourceReference: nullableText,
  note: nullableText,
  parameters: legalParamsSchema,
}).refine((v) => !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, {
  message: 'Geçersiz yasal parametre tarih aralığı.',
  path: ['effectiveTo'],
});
