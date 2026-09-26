import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("client state transport", () => {
  it("does not construct EventSource in event-facing client components", () => {
    const files = [
      "src/components/quiz/QuizHost.tsx",
      "src/components/quiz/QuizParticipant.tsx",
      "src/components/quiz/QuizProjector.tsx",
      "src/components/draw/ProjectorScene.tsx",
      "src/components/admin/OperationsDashboard.tsx",
    ];
    for (const file of files) expect(readFileSync(resolve(process.cwd(), file), "utf8")).not.toContain("EventSource");
  });
});
