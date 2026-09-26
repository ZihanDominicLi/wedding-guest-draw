import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { ok, problem } from "@/lib/http";
import { quizProblem } from "@/modules/quiz/http";
import { scheduleTransition, type ControlAction } from "@/modules/quiz/transition";

const controlSchema = z.object({
  action: z.enum(["START", "END_AND_NEXT", "FINALIZE", "REVEAL_NEXT", "FINISH", "RESUME_SETTLEMENT"]),
  expectedVersion: z.number().int().positive(),
  requestId: z.string().trim().min(1).max(160),
});

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const requestHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host)
      .split(",", 1)[0]!.trim().toLowerCase();
    return originHost === requestHost;
  } catch {
    return false;
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return noStore(problem(403, "CROSS_ORIGIN_REQUEST", "请求来源无效"));
  try {
    const administrator = await requireAdmin(request.headers);
    const { id } = await context.params;
    const input = controlSchema.parse(await request.json());
    return noStore(ok(await scheduleTransition({
      eventId: id,
      action: input.action as ControlAction,
      expectedVersion: input.expectedVersion,
      requestId: input.requestId,
      actorId: administrator.id,
    })));
  } catch (error) {
    const response = quizProblem(error);
    if (response) return noStore(response);
    return noStore(problem(500, "EVENT_CONTROL_UNAVAILABLE", "现场控制暂时不可用"));
  }
}
