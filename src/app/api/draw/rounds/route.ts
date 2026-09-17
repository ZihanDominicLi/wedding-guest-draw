import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok } from "@/lib/http";
import { drawingProblem, idempotencyKey } from "@/modules/drawing/http";
import { createRound } from "@/modules/drawing/service";

const createSchema = z.object({
  prizeId: z.string().uuid(),
  targetGroupId: z.string().uuid(),
  winnerCount: z.number().int().positive().max(500),
});

export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
    return ok(
      await db.drawRound.findMany({
        include: {
          prize: { select: { name: true } },
          targetGroup: { select: { name: true } },
          _count: { select: { snapshots: true, winners: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    );
  } catch (error) {
    const response = drawingProblem(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const administrator = await requireAdmin(request.headers);
    const input = createSchema.parse(await request.json());
    return ok(
      await createRound(input, administrator.id, idempotencyKey(request)),
      { status: 201 },
    );
  } catch (error) {
    const response = drawingProblem(error);
    if (response) return response;
    throw error;
  }
}
