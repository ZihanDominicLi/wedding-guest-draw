import { describe, expect, it } from "vitest";

import {
  hashParticipantToken,
  issueParticipantToken,
  readParticipantToken,
} from "@/modules/quiz/participant-token";

describe("quiz participant tokens", () => {
  it("issues unpredictable raw tokens and stores only a deterministic hash", () => {
    const first = issueParticipantToken();
    const second = issueParticipantToken();
    expect(first.rawToken).toHaveLength(43);
    expect(first.rawToken).not.toBe(second.rawToken);
    expect(first.tokenHash).toBe(hashParticipantToken(first.rawToken));
    expect(first.tokenHash).not.toContain(first.rawToken);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reads only the quiz cookie", () => {
    const token = issueParticipantToken().rawToken;
    const request = new Request("https://example.test/api/quiz/current", {
      headers: { cookie: `other=1; wedding-quiz-token=${encodeURIComponent(token)}` },
    });
    expect(readParticipantToken(request)).toBe(token);
    expect(readParticipantToken(new Request("https://example.test"))).toBeNull();
  });
});
