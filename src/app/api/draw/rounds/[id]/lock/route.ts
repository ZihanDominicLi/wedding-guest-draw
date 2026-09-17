import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { ok } from "@/lib/http";
import { drawingProblem, idempotencyKey } from "@/modules/drawing/http";
import { lockRound } from "@/modules/drawing/service";

const bodySchema = z.object({ expectedVersion: z.number().int().positive(), backupOverrideReason: z.string().trim().min(4).max(200).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const administrator = await requireAdmin(request.headers);
    const { id } = await context.params;
    const { expectedVersion, backupOverrideReason } = bodySchema.parse(await request.json());
    return ok(await lockRound(id, expectedVersion, administrator.id, idempotencyKey(request), { backupOverrideReason }));
  } catch (error) {
    const response = drawingProblem(error);
    if (response) return response;
    throw error;
  }
}
