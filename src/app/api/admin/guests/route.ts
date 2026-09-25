import { ZodError, z } from "zod";

import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, problem } from "@/lib/http";
import { buildGuestCsv } from "@/modules/guests/export";
import { createCollisionGuest, listGuests } from "@/modules/guests/service";
import { registrationSchema } from "@/modules/registration";

const querySchema = z.object({
  query: z.string().optional(),
  primaryGroupKey: z.string().optional(),
  tagKey: z.string().optional(),
  enabled: z.enum(["true", "false"]).optional(),
  exception: z.enum(["true", "false"]).optional(),
  quizCompleted: z.enum(["true", "false"]).optional(),
  quizMinScore: z.coerce.number().int().min(0).max(10).optional(),
  quizMaxScore: z.coerce.number().int().min(0).max(10).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));
    const result = await listGuests({
      query: query.query,
      primaryGroupKey: query.primaryGroupKey,
      tagKey: query.tagKey,
      enabled: query.enabled === undefined ? undefined : query.enabled === "true",
      exception: query.exception === "true",
      quizCompleted: query.quizCompleted === undefined ? undefined : query.quizCompleted === "true",
      quizMinScore: query.quizMinScore,
      quizMaxScore: query.quizMaxScore,
      page: query.page,
      pageSize: query.format === "csv" ? 100 : query.pageSize,
    });
    if (query.format === "csv") {
      const allGuests = await db.guest.findMany({
        include: { primaryGroup: true, tags: { include: { tag: true } } },
        orderBy: { attendanceNumber: "asc" },
      });
      return new Response(buildGuestCsv(allGuests), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="wedding-guests.csv"',
        },
      });
    }
    return ok(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    if (error instanceof ZodError) return problem(422, "INVALID_QUERY", "筛选条件无效");
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const administrator = await requireAdmin(request.headers);
    const input = registrationSchema.parse(await request.json());
    return ok(await createCollisionGuest(input, administrator.id), { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    if (error instanceof ZodError) return problem(422, "INVALID_GUEST", "宾客信息无效");
    throw error;
  }
}
