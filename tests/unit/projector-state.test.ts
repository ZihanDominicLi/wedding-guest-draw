import { describe, expect, it } from "vitest";

import {
  createProjectorState,
  restoreProjectorState,
  type ScreenSnapshot,
} from "@/components/draw/projector-state";

const settings = { screenTitle: "陈先生与林女士的婚礼", screenBackgroundPath: null };

function snapshot(status: "LOCKED" | "DRAWN" | "PUBLISHED", version: number): ScreenSnapshot {
  return {
    settings,
    round: {
      id: "round-1",
      status,
      version,
      prizeName: "纪念礼",
      prizeImagePath: null,
      groupName: "共同好友组",
      candidates: ["周青", "林嘉"],
      winners: status === "LOCKED" ? [] : [{ id: "winner-1", name: "周青", status: status === "DRAWN" ? "RESERVED" : "PUBLISHED" }],
    },
  };
}

describe("projector state restoration", () => {
  it.each([
    ["LOCKED", "rolling"],
    ["DRAWN", "revealed"],
    ["PUBLISHED", "published"],
  ] as const)("restores %s as %s without rerolling", (status, phase) => {
    expect(restoreProjectorState(createProjectorState(settings), snapshot(status, 2))).toMatchObject({
      phase,
      roundId: "round-1",
      version: 2,
      winners: status === "LOCKED" ? [] : [{ name: "周青" }],
    });
  });

  it("ignores an older snapshot for the current round", () => {
    const current = restoreProjectorState(createProjectorState(settings), snapshot("PUBLISHED", 4));
    expect(restoreProjectorState(current, snapshot("LOCKED", 2))).toBe(current);
  });

  it("returns to idle when the server has no active round", () => {
    const current = restoreProjectorState(createProjectorState(settings), snapshot("DRAWN", 3));
    expect(restoreProjectorState(current, { settings, round: null })).toMatchObject({ phase: "idle", roundId: null, winners: [] });
  });
});
