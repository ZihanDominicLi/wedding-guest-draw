import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { ZodError } from "zod";

import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, problem } from "@/lib/http";
import { weddingSettingsSchema } from "@/modules/settings/schema";

const allowedImages = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function GET(request: Request) {
  try {
    await requireAdmin(request.headers);
    return ok(
      await db.weddingSettings.findUniqueOrThrow({ where: { id: "default" } }),
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return problem(401, "UNAUTHORIZED", "需要管理员登录");
    }
    throw error;
  }
}

export async function PUT(request: Request) {
  try {
    const administrator = await requireAdmin(request.headers);
    const formData = await request.formData();
    const input = weddingSettingsSchema.parse({
      groomName: formData.get("groomName") ?? "",
      brideName: formData.get("brideName") ?? "",
      weddingDate: formData.get("weddingDate") ?? "",
      venueProvince: formData.get("venueProvince") ?? "",
      venueCity: formData.get("venueCity") ?? "",
      registrationOpen: formData.get("registrationOpen") === "on",
      screenTitle: formData.get("screenTitle") ?? "我们的婚礼",
    });
    const previous = await db.weddingSettings.findUniqueOrThrow({
      where: { id: "default" },
    });
    const background = formData.get("background");
    let backgroundPath = previous.screenBackgroundPath;
    let absoluteNewPath: string | null = null;

    if (background instanceof File && background.size > 0) {
      const extension = allowedImages.get(background.type);
      if (!extension || background.size > 10 * 1024 * 1024) {
        return problem(422, "INVALID_BACKGROUND", "背景仅支持 10MB 内的 JPEG、PNG 或 WebP");
      }
      const uploadDirectory =
        process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads");
      await mkdir(uploadDirectory, { recursive: true });
      const filename = `wedding-background-${randomUUID()}.${extension}`;
      absoluteNewPath = path.join(uploadDirectory, filename);
      await writeFile(absoluteNewPath, Buffer.from(await background.arrayBuffer()));
      backgroundPath = `/uploads/${filename}`;
    }

    const updated = await db.$transaction(async (transaction) => {
      const settings = await transaction.weddingSettings.update({
        where: { id: "default" },
        data: {
          ...input,
          weddingDate: input.weddingDate
            ? new Date(`${input.weddingDate}T12:00:00.000Z`)
            : null,
          screenBackgroundPath: backgroundPath,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorId: administrator.id,
          action: "settings.updated",
          entityType: "WeddingSettings",
          entityId: settings.id,
          afterJson: {
            groomName: settings.groomName,
            brideName: settings.brideName,
            weddingDate: settings.weddingDate?.toISOString() ?? null,
            venueProvince: settings.venueProvince,
            venueCity: settings.venueCity,
            registrationOpen: settings.registrationOpen,
            screenTitle: settings.screenTitle,
            hasBackground: Boolean(settings.screenBackgroundPath),
          },
        },
      });
      return settings;
    });

    if (absoluteNewPath && previous.screenBackgroundPath?.startsWith("/uploads/")) {
      const uploadDirectory =
        process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads");
      await unlink(path.join(uploadDirectory, path.basename(previous.screenBackgroundPath))).catch(
        () => undefined,
      );
    }
    return ok(updated);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return problem(401, "UNAUTHORIZED", "需要管理员登录");
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return problem(422, "INVALID_SETTINGS", "请检查婚礼设置信息");
    }
    throw error;
  }
}
