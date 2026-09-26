import { describe, expect, it } from "vitest";

import { buildFrozenResults, scoreAnswers } from "@/modules/quiz/results";

const participants = [
  { id: "elder-1", displayName: "长辈甲（0001）", group: "ELDER" as const, hasChildren: false, answerScores: [true, true, true, true, true, true, true, true, true, true] },
  { id: "elder-2", displayName: "长辈乙（0002）", group: "ELDER" as const, hasChildren: true, answerScores: [true, false, false, false, false, false, false, false, false, false] },
  { id: "friend-1", displayName: "朋友甲（0003）", group: "FRIEND" as const, hasChildren: true, answerScores: [true, true, true, true, true, false, false, false, false, false] },
  { id: "friend-2", displayName: "朋友乙（0004）", group: "FRIEND" as const, hasChildren: false, answerScores: [false, false, false, false, false, false, false, false, false, false] },
];

describe("wedding quiz settlement rules", () => {
  it("scores each correct answer as one point and leaves unanswered answers at zero", () => {
    expect(scoreAnswers([true, false, null, true])).toEqual({ totalScore: 2, answeredCount: 3 });
  });

  it("freezes five rounds without selecting a participant twice", () => {
    const rounds = buildFrozenResults(participants, "wedding-v1", () => 0);
    expect(rounds).toHaveLength(5);
    const winners = rounds.flatMap((round) => round.winners.map((winner) => winner.participantId));
    expect(new Set(winners).size).toBe(winners.length);
    expect(rounds.map((round) => round.requestedCount)).toEqual([10, 5, 20, 10, 20]);
    expect(rounds[0].winners[0].score).toBe(10);
    expect(rounds[0].type).toBe("ELDER_TOP");
  });

  it("reports shortages instead of borrowing candidates from another group", () => {
    const rounds = buildFrozenResults(participants, "wedding-v1", () => 0);
    expect(rounds[1].eligibleCount).toBe(2);
    expect(rounds[1].actualCount).toBe(2);
    expect(rounds[1].shortage).toBe(3);
  });
});
