import { FreshAuthenticationRequiredError, requireFreshAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { problem } from "@/lib/http";
import { buildEmergencyCsv } from "@/modules/backup/emergency-export";

export async function GET(request: Request) {
  try {
    await requireFreshAdmin(request.headers);
    const guests = await db.guest.findMany({ include: { primaryGroup: { select: { name: true } }, winners: { select: { status: true } } }, orderBy: { attendanceNumber: "asc" } });
    return new Response(buildEmergencyCsv(guests), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="wedding-emergency.csv"' } });
  } catch (error) {
    if (error instanceof FreshAuthenticationRequiredError) return problem(401, "FRESH_AUTH_REQUIRED", "请重新登录后再导出");
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    throw error;
  }
}
