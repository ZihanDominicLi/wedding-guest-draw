import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { ok, problem } from "@/lib/http";
import { getAdminSnapshot } from "@/modules/live/snapshot";

export async function GET(request: Request) {
  try { await requireAdmin(request.headers); } catch (error) {
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    throw error;
  }
  const response = ok(await getAdminSnapshot());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
