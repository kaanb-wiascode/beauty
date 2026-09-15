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

export const updateRoomStatusSchema = z.object({ status: roomStatusSchema });

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

export const allocateAppointmentResourcesSchema = z
  .object({
    roomId: z.string().uuid().optional(),
    assetId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.roomId || value.assetId), {
    message: 'At least one room or asset must be selected.',
  });

export const releaseAllocationSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
});

export const operationsCapacityQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((value) => value.from < value.to, {
    message: 'Capacity from must be before to.',
    path: ['to'],
  });

export const resourceCalendarQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((value) => value.from < value.to, {
    message: 'Resource calendar from must be before to.',
    path: ['to'],
  })
  .refine(
    (value) => value.to.getTime() - value.from.getTime() <= 31 * 24 * 60 * 60 * 1000,
    {
      message: 'Resource calendar range cannot exceed 31 days.',
      path: ['to'],
    },
  );

export const createResourceBlockSchema = z
  .object({
    roomId: z.string().uuid().optional(),
    assetId: z.string().uuid().optional(),
    blockedFrom: z.coerce.date(),
    blockedTo: z.coerce.date(),
    reason: z.string().trim().min(3).max(1000),
  })
  .refine((value) => Boolean(value.roomId) !== Boolean(value.assetId), {
    message: 'Select exactly one room or asset.',
  })
  .refine((value) => value.blockedFrom < value.blockedTo, {
    message: 'Resource block start must be before end.',
    path: ['blockedTo'],
  });

export const cancelResourceBlockSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
});

export const listResourceBlocksQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine(
    (value) => !value.from || !value.to || value.from < value.to,
    'Resource block from must be before to.',
  );

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomStatusInput = z.infer<typeof updateRoomStatusSchema>;
export type UpsertServiceOperationalRequirementInput = z.infer<
  typeof upsertServiceOperationalRequirementSchema
>;
export type AllocateAppointmentResourcesInput = z.infer<
  typeof allocateAppointmentResourcesSchema
>;
export type ReleaseAllocationInput = z.infer<typeof releaseAllocationSchema>;
export type OperationsCapacityQueryInput = z.infer<
  typeof operationsCapacityQuerySchema
>;
export type ResourceCalendarQueryInput = z.infer<
  typeof resourceCalendarQuerySchema
>;
export type CreateResourceBlockInput = z.infer<
  typeof createResourceBlockSchema
>;
export type CancelResourceBlockInput = z.infer<
  typeof cancelResourceBlockSchema
>;
export type ListResourceBlocksQueryInput = z.infer<
  typeof listResourceBlocksQuerySchema
>;
