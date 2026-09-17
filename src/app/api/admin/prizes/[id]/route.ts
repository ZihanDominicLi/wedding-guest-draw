import { ZodError } from "zod";

import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, problem } from "@/lib/http";
import { removeUploadedImage, storePrizeImage } from "@/modules/prizes/image";
import { prizeInputSchema } from "@/modules/prizes/input";

function parseForm(form: FormData) {
  return prizeInputSchema.parse({ name: form.get("name"), plannedWinnerCount: form.get("plannedWinnerCount"), sortOrder: form.get("sortOrder"), enabled: form.get("enabled") === "on", groupIds: form.getAll("groupIds") });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  let storedImage: string | null = null;
  try {
    const administrator = await requireAdmin(request.headers);
    const { id } = await context.params;
    const previous = await db.prize.findUniqueOrThrow({ where: { id } });
    const form = await request.formData();
    const input = parseForm(form);
    const file = form.get("image");
    storedImage = await storePrizeImage(file instanceof File ? file : null);
    const updated = await db.$transaction(async (transaction) => {
      await transaction.prizeGroup.deleteMany({ where: { prizeId: id } });
      const prize = await transaction.prize.update({
        where: { id },
        data: { name: input.name, plannedWinnerCount: input.plannedWinnerCount, sortOrder: input.sortOrder, enabled: input.enabled, ...(storedImage ? { imagePath: storedImage } : {}), allowedGroups: { create: input.groupIds.map((groupId) => ({ groupId })) } },
        include: { allowedGroups: true },
      });
      await transaction.auditEvent.create({ data: { actorId: administrator.id, action: "prize.updated", entityType: "Prize", entityId: id, afterJson: { name: prize.name, enabled: prize.enabled, groupCount: input.groupIds.length } } });
      return prize;
    });
    if (storedImage) await removeUploadedImage(previous.imagePath);
    return ok(updated);
  } catch (error) {
    if (storedImage) await removeUploadedImage(storedImage);
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    if (error instanceof ZodError || (error instanceof Error && error.message === "INVALID_PRIZE_IMAGE")) return problem(422, "INVALID_PRIZE", "请检查奖品信息或图片");
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const administrator = await requireAdmin(request.headers);
    const { id } = await context.params;
    const prize = await db.prize.update({ where: { id }, data: { enabled: false } });
    await db.auditEvent.create({ data: { actorId: administrator.id, action: "prize.disabled", entityType: "Prize", entityId: id, afterJson: { enabled: false } } });
    return ok(prize);
  } catch (error) {
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    throw error;
  }
}
