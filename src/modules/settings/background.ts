const MAX_BACKGROUND_BYTES = 25 * 1024 * 1024;

const allowedBackgroundTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function getWeddingBackgroundExtension(type: string, size: number) {
  if (size <= 0 || size > MAX_BACKGROUND_BYTES) return null;
  return allowedBackgroundTypes.get(type) ?? null;
}
