import { describe, expect, it } from "vitest";

import { applyVersionedState } from "@/lib/polling/useEventStatePolling";

describe("event state polling", () => {
  it("rejects an older response", () => {
    const previous = { version: 3, phase: "QUESTION" };
    expect(applyVersionedState(previous, { version: 2, phase: "REGISTRATION" })).toBe(previous);
    expect(applyVersionedState(previous, { version: 4, phase: "SETTLING" })).toEqual({ version: 4, phase: "SETTLING" });
  });

  it("accepts snapshots without a version for legacy projector endpoints", () => {
    expect(applyVersionedState({ phase: "idle" }, { phase: "rolling" })).toEqual({ phase: "rolling" });
  });
});
