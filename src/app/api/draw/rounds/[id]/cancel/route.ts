import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { ok } from "@/lib/http";
import { drawingProblem, idempotencyKey } from "@/modules/drawing/http";
import { cancelRound } from "@/modules/drawing/service";

const bodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(2).max(200),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const administrator = await requireAdmin(request.headers);
    const { id } = await context.params;
    const { expectedVersion, reason } = bodySchema.parse(await request.json());
    return ok(await cancelRound(id, expectedVersion, administrator.id, reason, idempotencyKey(request)));
  } catch (error) {
    const response = drawingProblem(error);
    if (response) return response;
    throw error;
  }
}
