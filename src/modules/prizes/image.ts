import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function uploadDirectory() {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads");
}

export async function storePrizeImage(file: File | null) {
  if (!file || file.size === 0) return null;
  const extension = TYPES.get(file.type);
  if (!extension || file.size > 10 * 1024 * 1024) {
    throw new Error("INVALID_PRIZE_IMAGE");
  }
  await mkdir(uploadDirectory(), { recursive: true });
  const filename = `prize-${randomUUID()}.${extension}`;
  await writeFile(path.join(uploadDirectory(), filename), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${filename}`;
}

export async function removeUploadedImage(imagePath: string | null) {
  if (!imagePath?.startsWith("/uploads/")) return;
  await unlink(path.join(uploadDirectory(), path.basename(imagePath))).catch(() => undefined);
}
