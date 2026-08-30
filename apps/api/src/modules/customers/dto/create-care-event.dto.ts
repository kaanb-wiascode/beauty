import { z } from "zod";

export const createCareEventSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  staffId: z.string().uuid().optional(),

  type: z.enum([
    "REACTION",
    "AFTERCARE",
    "COMPLAINT",
    "FOLLOW_UP",
    "INCIDENT",
    "NOTE",
  ]),

  status: z
    .enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
    .default("OPEN"),

  severity: z
    .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
    .optional(),

  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),

  onsetAt: z.coerce.date().optional(),
  occurredAt: z.coerce.date().optional(),

  actionTaken: z.string().trim().max(5000).optional(),
  followUpAt: z.coerce.date().optional(),
});

export type CreateCareEventInput = z.infer<
  typeof createCareEventSchema
>;
