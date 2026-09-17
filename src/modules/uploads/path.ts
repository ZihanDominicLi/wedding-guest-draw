import path from "node:path";

const IMAGE_NAME = /^(?:prize|wedding-background)-[a-zA-Z0-9-]+\.(?:jpg|png|webp)$/;

export function resolveUploadedAsset(directory: string, filename: string) {
  if (!IMAGE_NAME.test(filename)) throw new Error("Invalid uploaded filename");
  return path.join(directory, filename);
}

export function uploadedImageType(filename: string) {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
