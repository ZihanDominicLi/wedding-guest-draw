import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok } from "@/lib/http";
import { DrawingValidationError, revokeWinner } from "@/modules/drawing/service";
import { drawingProblem, idempotencyKey } from "@/modules/drawing/http";

const bodySchema = z.object({
  winnerId: z.string().uuid(),
  reason: z.string().trim().min(2).max(200),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const administrator = await requireAdmin(request.headers);
    const { id: roundId } = await context.params;
    const { winnerId, reason } = bodySchema.parse(await request.json());
    const winner = await db.winner.findFirst({ where: { id: winnerId, roundId }, select: { id: true } });
    if (!winner) throw new DrawingValidationError("Winner is not part of this round");
    return ok(await revokeWinner(winnerId, administrator.id, reason, idempotencyKey(request)));
  } catch (error) {
    const response = drawingProblem(error);
    if (response) return response;
    throw error;
  }
}
