import { z } from 'zod';

export const roomStatusSchema = z.enum([
  'AVAILABLE',
  'RESERVED',
  'IN_USE',
  'CLEANING',
  'OUT_OF_SERVICE',
]);

export const createRoomSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(160),
  roomType: z.string().trim().min(1).max(80).default('TREATMENT_ROOM'),
  capacity: z.coerce.number().int().positive().max(50).default(1),
  notes: z.string().trim().max(1000).optional(),
});

export const updateRoomStatusSchema = z.object({
  status: roomStatusSchema,
});

export const upsertServiceOperationalRequirementSchema = z
  .object({
    roomType: z.string().trim().min(1).max(80).nullable().optional(),
    requiredAssetType: z.string().trim().min(1).max(80).nullable().optional(),
    requiredAssetId: z.string().uuid().nullable().optional(),
    prepDurationMinutes: z.coerce.number().int().min(0).max(240).default(0),
    cleanupDurationMinutes: z.coerce.number().int().min(0).max(240).default(0),
  })
  .refine(
    (value) => !value.requiredAssetId || !value.requiredAssetType,
    'Use either requiredAssetId or requiredAssetType, not both.',
  );

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomStatusInput = z.infer<typeof updateRoomStatusSchema>;
export type UpsertServiceOperationalRequirementInput = z.infer<
  typeof upsertServiceOperationalRequirementSchema
>;
