import { describe, expect, it } from "vitest";

import { applyVersionedState, getPollingDelay } from "@/lib/polling/useEventStatePolling";

describe("event state polling", () => {
  it("rejects an older response", () => {
    const previous = { version: 3, phase: "QUESTION" };
    expect(applyVersionedState(previous, { version: 2, phase: "REGISTRATION" })).toBe(previous);
    expect(applyVersionedState(previous, { version: 4, phase: "SETTLING" })).toEqual({ version: 4, phase: "SETTLING" });
  });

  it("accepts snapshots without a version for legacy projector endpoints", () => {
    expect(applyVersionedState({ phase: "idle" }, { phase: "rolling" })).toEqual({ phase: "rolling" });
  });

  it("backs off after failures and returns to the normal cadence after success", () => {
    expect(getPollingDelay(5_000, 0)).toBe(5_000);
    expect(getPollingDelay(5_000, 1)).toBe(10_000);
    expect(getPollingDelay(5_000, 2)).toBe(20_000);
    expect(getPollingDelay(5_000, 10)).toBe(30_000);
  });
});
