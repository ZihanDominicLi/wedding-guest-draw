import { z, ZodError } from "zod";

import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, problem } from "@/lib/http";

const querySchema = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().positive().max(100).default(50), action: z.string().max(80).optional() });

export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const where = query.action ? { action: { contains: query.action, mode: "insensitive" as const } } : {};
    const [items, total] = await Promise.all([
      db.auditEvent.findMany({ where, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      db.auditEvent.count({ where }),
    ]);
    return ok({ items, total, page: query.page });
  } catch (error) {
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    if (error instanceof ZodError) return problem(422, "INVALID_QUERY", "查询条件无效");
    throw error;
  }
}
