import { problem } from "@/lib/http";
import { getHealth } from "@/modules/health/service";

export async function GET() {
  try {
    return Response.json(await getHealth());
  } catch {
    return problem(503, "DATABASE_UNAVAILABLE", "数据库暂时不可用");
  }
}
