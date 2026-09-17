import { ZodError } from "zod";

import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, problem } from "@/lib/http";
import { storePrizeImage } from "@/modules/prizes/image";
import { prizeInputSchema } from "@/modules/prizes/input";

function parseForm(form: FormData) {
  return prizeInputSchema.parse({
    name: form.get("name"),
    plannedWinnerCount: form.get("plannedWinnerCount"),
    sortOrder: form.get("sortOrder"),
    enabled: form.get("enabled") === "on",
    groupIds: form.getAll("groupIds"),
  });
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
    return ok(await db.prize.findMany({ include: { allowedGroups: true }, orderBy: { sortOrder: "asc" } }));
  } catch (error) {
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    throw error;
  }
}

export async function POST(request: Request) {
  let storedImage: string | null = null;
  try {
    const administrator = await requireAdmin(request.headers);
    const form = await request.formData();
    const input = parseForm(form);
    const image = form.get("image");
    storedImage = await storePrizeImage(image instanceof File ? image : null);
    const prize = await db.$transaction(async (transaction) => {
      const created = await transaction.prize.create({
        data: {
          name: input.name,
          plannedWinnerCount: input.plannedWinnerCount,
          sortOrder: input.sortOrder,
          enabled: input.enabled,
          imagePath: storedImage,
          allowedGroups: { create: input.groupIds.map((groupId) => ({ groupId })) },
        },
        include: { allowedGroups: true },
      });
      await transaction.auditEvent.create({ data: { actorId: administrator.id, action: "prize.created", entityType: "Prize", entityId: created.id, afterJson: { name: created.name, groupCount: input.groupIds.length } } });
      return created;
    });
    return ok(prize, { status: 201 });
  } catch (error) {
    if (storedImage) await import("@/modules/prizes/image").then(({ removeUploadedImage }) => removeUploadedImage(storedImage));
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    if (error instanceof ZodError || (error instanceof Error && error.message === "INVALID_PRIZE_IMAGE")) return problem(422, "INVALID_PRIZE", "请检查奖品信息或图片");
    throw error;
  }
}
