import { ZodError, z } from "zod";

import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { ok, problem } from "@/lib/http";
import { previewRecalculation } from "@/modules/grouping/service";

const requestSchema = z.object({ ruleSetId: z.string().regex(/^\d+$/) });

export async function POST(request: Request) {
  try {
    await requireAdmin(request.headers);
    const { ruleSetId } = requestSchema.parse(await request.json());
    return ok(await previewRecalculation(ruleSetId));
  } catch (error) {
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    if (error instanceof ZodError) return problem(422, "INVALID_RULE_SET", "规则版本无效");
    throw error;
  }
}
