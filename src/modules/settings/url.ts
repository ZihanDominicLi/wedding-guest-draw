export function canonicalJoinUrl(baseUrl: string): string {
  return new URL("/join", baseUrl).toString();
}
