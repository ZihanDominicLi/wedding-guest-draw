import { GuestRelation } from "@prisma/client";
import { ZodError, z } from "zod";

import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { ok, problem } from "@/lib/http";
import { updateGuest } from "@/modules/guests/service";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  relation: z.nativeEnum(GuestRelation).optional(),
  childCount: z.number().int().min(0).max(20).optional(),
  originProvince: z.string().trim().min(1).max(30).optional(),
  originCity: z.string().trim().min(1).max(30).optional(),
  primaryGroupId: z.string().uuid().nullable().optional(),
  groupLocked: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const administrator = await requireAdmin(request.headers);
    const { id } = await context.params;
    const patch = patchSchema.parse(await request.json());
    return ok(await updateGuest(id, patch, administrator.id));
  } catch (error) {
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    if (error instanceof ZodError) return problem(422, "INVALID_GUEST", "宾客信息无效");
    throw error;
  }
}
