import { z } from "zod";

export const updateCareEventSchema = z
  .object({
    appointmentId: z.string().uuid().nullable().optional(),
    staffId: z.string().uuid().nullable().optional(),

    type: z
      .enum([
        "REACTION",
        "AFTERCARE",
        "COMPLAINT",
        "FOLLOW_UP",
        "INCIDENT",
        "NOTE",
      ])
      .optional(),

    status: z
      .enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"])
      .optional(),

    severity: z
      .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
      .nullable()
      .optional(),

    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),

    onsetAt: z.coerce.date().nullable().optional(),
    occurredAt: z.coerce.date().optional(),

    actionTaken: z.string().trim().max(5000).nullable().optional(),
    followUpAt: z.coerce.date().nullable().optional(),

    resolvedAt: z.coerce.date().nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    {
      message: "At least one field must be provided",
    },
  );

export type UpdateCareEventInput = z.infer<
  typeof updateCareEventSchema
>;
