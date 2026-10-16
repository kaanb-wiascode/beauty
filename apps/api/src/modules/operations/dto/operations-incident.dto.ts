import { z } from 'zod';

export const operationsIncidentTypeSchema = z.enum([
  'DEVICE_FAILURE',
  'ROOM_UNAVAILABLE',
  'POWER',
  'NETWORK',
  'STAFFING',
  'OTHER',
]);

export const operationsIncidentSeveritySchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

export const createOperationsIncidentSchema = z
  .object({
    type: operationsIncidentTypeSchema,
    severity: operationsIncidentSeveritySchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    roomId: z.string().uuid().nullable().optional(),
    assetId: z.string().uuid().nullable().optional(),
    qualityCaseId: z.string().uuid().nullable().optional(),
    outageFrom: z.coerce.date().optional(),
    outageTo: z.coerce.date().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.roomId && value.assetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assetId'],
        message: 'An incident can block either a room or an asset, not both.',
      });
    }
    if ((value.roomId || value.assetId) && !value.outageTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outageTo'],
        message: 'Resource incidents require an expected outage end time.',
      });
    }
    if (
      value.outageTo &&
      value.outageFrom &&
      value.outageFrom >= value.outageTo
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outageTo'],
        message: 'outageFrom must be before outageTo.',
      });
    }
  });

export const listOperationsIncidentsSchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED']).optional(),
  severity: operationsIncidentSeveritySchema.optional(),
});

export const resolveOperationsIncidentSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  resolutionNote: z.string().trim().min(1).max(2000),
});

export type CreateOperationsIncidentInput = z.infer<
  typeof createOperationsIncidentSchema
>;
export type ListOperationsIncidentsInput = z.infer<
  typeof listOperationsIncidentsSchema
>;
export type ResolveOperationsIncidentInput = z.infer<
  typeof resolveOperationsIncidentSchema
>;
