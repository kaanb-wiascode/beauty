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
  year: z.coerce.number().int().min(2000).max(2100),
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
