import { z } from 'zod';

const staffProfileSchema = z.object({
  identityNumber: z.string().trim().max(20).optional(),
  birthDate: z.string().trim().max(30).optional(),
  birthPlace: z.string().trim().max(100).optional(),
  gender: z.string().trim().max(30).optional(),
  maritalStatus: z.string().trim().max(30).optional(),
  nationality: z.string().trim().max(80).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  personnelNumber: z.string().trim().max(50).optional(),
  position: z.string().trim().max(100).optional(),
  department: z.string().trim().max(100).optional(),
  employmentType: z.string().trim().max(50).optional(),
  hireDate: z.string().trim().max(30).optional(),
  contractType: z.string().trim().max(50).optional(),
  salaryType: z.string().trim().max(50).optional(),
  salary: z.number().nonnegative().optional(),
  iban: z.string().trim().max(50).optional(),
  bankName: z.string().trim().max(100).optional(),
  emergencyName: z.string().trim().max(150).optional(),
  emergencyRelation: z.string().trim().max(50).optional(),
  emergencyPhone: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const createStaffSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(255).optional(),
  profile: staffProfileSchema.optional(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type StaffProfileInput = z.infer<typeof staffProfileSchema>;
