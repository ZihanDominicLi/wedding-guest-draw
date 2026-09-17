import { z } from "zod";

export const prizeInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  plannedWinnerCount: z.coerce.number().int().min(1).max(500),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  enabled: z.boolean(),
  groupIds: z.array(z.string().uuid()).min(1),
});
