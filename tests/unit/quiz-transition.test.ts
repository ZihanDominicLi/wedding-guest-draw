import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRANSITION_DELAY_MS,
  getTransitionTarget,
  isTransitionApplicable,
  isControlActionAllowed,
  type ControlAction,
} from "@/modules/quiz/transition";

describe("persistent quiz transition rules", () => {
  it("uses the agreed eight-second default delay", () => {
    expect(DEFAULT_TRANSITION_DELAY_MS).toBe(8_000);
  });

  it("moves registration to the first question", () => {
    expect(getTransitionTarget({ phase: "REGISTRATION", questionIndex: null, round: null }, "START")).toEqual({
      phase: "QUESTION",
      questionIndex: 1,
      round: null,
    });
  });

  it("moves the tenth question into settling instead of creating question eleven", () => {
    expect(getTransitionTarget({ phase: "QUESTION", questionIndex: 10, round: null }, "END_AND_NEXT")).toEqual({
      phase: "SETTLING",
      questionIndex: null,
      round: null,
    });
  });

  it("rejects controls that do not belong to the current phase", () => {
    const actions: ControlAction[] = ["START", "END_AND_NEXT", "FINALIZE", "REVEAL_NEXT", "FINISH", "RESUME_SETTLEMENT"];
    expect(actions.filter((action) => isControlActionAllowed("REGISTRATION", action))).toEqual(["START"]);
    expect(actions.filter((action) => isControlActionAllowed("RESULTS", action))).toEqual(["REVEAL_NEXT", "FINISH"]);
  });

  it("only applies a pending transition while its recorded source phase is current", () => {
    expect(isTransitionApplicable("QUESTION", "QUESTION")).toBe(true);
    expect(isTransitionApplicable("REGISTRATION", "QUESTION")).toBe(false);
  });
});
