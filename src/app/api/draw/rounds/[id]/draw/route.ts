import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { ok } from "@/lib/http";
import { drawingProblem, idempotencyKey } from "@/modules/drawing/http";
import { drawRound } from "@/modules/drawing/service";

const bodySchema = z.object({ expectedVersion: z.number().int().positive() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const administrator = await requireAdmin(request.headers);
    const { id } = await context.params;
    const { expectedVersion } = bodySchema.parse(await request.json());
    return ok(await drawRound(id, expectedVersion, administrator.id, idempotencyKey(request)));
  } catch (error) {
    const response = drawingProblem(error);
    if (response) return response;
    throw error;
  }
}
