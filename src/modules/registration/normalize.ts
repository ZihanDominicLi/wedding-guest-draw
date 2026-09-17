export function normalizeGuestName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/gu, "");
}
