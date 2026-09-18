import { z } from 'zod';

export const startWalkInServiceExecutionSchema = z.object({
  commercialContextId: z.string().uuid(),
  saleItemId: z.string().uuid(),
  staffId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  note: z.string().trim().max(2000).optional(),
});

export type StartWalkInServiceExecutionInput = z.infer<
  typeof startWalkInServiceExecutionSchema
>;
