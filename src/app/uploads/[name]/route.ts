import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveUploadedAsset, uploadedImageType } from "@/modules/uploads/path";

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await context.params;
    const directory = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads");
    const image = await readFile(resolveUploadedAsset(directory, name));
    return new Response(image, {
      headers: {
        "Content-Type": uploadedImageType(name),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
