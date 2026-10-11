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

export const payQueueItemSchema = z.object(paymentFields);
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
