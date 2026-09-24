import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export function issueParticipantToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  return { rawToken, tokenHash: hashParticipantToken(rawToken) };
}

export function hashParticipantToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function readParticipantToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)wedding-quiz-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export const PARTICIPANT_TOKEN_COOKIE = "wedding-quiz-token";
