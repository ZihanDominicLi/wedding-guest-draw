import { randomInt, randomUUID } from "node:crypto";

export type ResultGroup = "ELDER" | "FRIEND";

export type SettledParticipant = {
  id: string;
  displayName: string;
  group: ResultGroup;
  hasChildren: boolean;
  totalScore: number;
  answeredCount: number;
};

export type ParticipantScoreInput = Omit<SettledParticipant, "totalScore" | "answeredCount"> & {
  answerScores: Array<boolean | null>;
};

export type FrozenWinner = {
  id: string;
  participantId: string;
  ordinal: number;
  displayName: string;
  score: number;
};

export type FrozenRound = {
  id: string;
  round: number;
  type: "ELDER_TOP" | "FRIEND_TOP" | "ELDER_RANDOM" | "FRIEND_RANDOM" | "WITH_CHILD_RANDOM";
  requestedCount: number;
  eligibleCount: number;
  actualCount: number;
  shortage: number;
  actualThreshold: number | null;
  ruleVersion: string;
  candidateSnapshot: Array<{ participantId: string; displayName: string; score: number }>;
  sameScoreOrder: string[];
  winners: FrozenWinner[];
};

export function scoreAnswers(answerScores: Array<boolean | null>): { totalScore: number; answeredCount: number } {
  return {
    totalScore: answerScores.reduce((total, answer) => total + (answer === true ? 10 : 0), 0),
    answeredCount: answerScores.filter((answer) => answer !== null).length,
  };
}

function shuffle<T>(items: T[], nextRandom: (max: number) => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = nextRandom(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function toCandidateSnapshot(participants: SettledParticipant[]) {
  return participants.map((participant) => ({ participantId: participant.id, displayName: participant.displayName, score: participant.totalScore }));
}

export function buildFrozenResults(
  inputs: Array<SettledParticipant | ParticipantScoreInput>,
  ruleVersion: string,
  nextRandom: (max: number) => number = (max) => randomInt(max),
): FrozenRound[] {
  const participants: SettledParticipant[] = inputs.map((participant) => {
    if ("answerScores" in participant) {
      const score = scoreAnswers(participant.answerScores);
      return { id: participant.id, displayName: participant.displayName, group: participant.group, hasChildren: participant.hasChildren, ...score };
    }
    return participant;
  });
  const remaining = new Map(participants.map((participant) => [participant.id, participant]));
  const definitions = [
    { type: "ELDER_TOP" as const, group: "ELDER" as const, requestedCount: 10, mode: "top" as const, filter: (participant: SettledParticipant) => participant.group === "ELDER" },
    { type: "FRIEND_TOP" as const, group: "FRIEND" as const, requestedCount: 5, mode: "top" as const, filter: (participant: SettledParticipant) => participant.group === "FRIEND" },
    { type: "ELDER_RANDOM" as const, group: "ELDER" as const, requestedCount: 20, mode: "random" as const, filter: (participant: SettledParticipant) => participant.group === "ELDER" },
    { type: "FRIEND_RANDOM" as const, group: "FRIEND" as const, requestedCount: 10, mode: "random" as const, filter: (participant: SettledParticipant) => participant.group === "FRIEND" },
    { type: "WITH_CHILD_RANDOM" as const, group: null, requestedCount: 20, mode: "random" as const, filter: (participant: SettledParticipant) => participant.hasChildren },
  ];

  return definitions.map((definition, index) => {
    const eligible = [...remaining.values()].filter(definition.filter);
    const sameScoreOrder = shuffle(eligible, nextRandom).map((participant) => participant.id);
    const ordered = definition.mode === "top"
      ? sameScoreOrder.map((id) => eligible.find((participant) => participant.id === id)!).sort((left, right) => right.totalScore - left.totalScore)
      : shuffle(eligible, nextRandom);
    const selected = ordered.slice(0, definition.requestedCount);
    selected.forEach((participant) => remaining.delete(participant.id));
    return {
      id: randomUUID(),
      round: index + 1,
      type: definition.type,
      requestedCount: definition.requestedCount,
      eligibleCount: eligible.length,
      actualCount: selected.length,
      shortage: Math.max(0, definition.requestedCount - selected.length),
      actualThreshold: definition.mode === "top" && selected.length ? selected[selected.length - 1].totalScore : null,
      ruleVersion,
      candidateSnapshot: toCandidateSnapshot(eligible),
      sameScoreOrder,
      winners: selected.map((participant, winnerIndex) => ({ id: randomUUID(), participantId: participant.id, ordinal: winnerIndex + 1, displayName: participant.displayName, score: participant.totalScore })),
    } satisfies FrozenRound;
  });
}
