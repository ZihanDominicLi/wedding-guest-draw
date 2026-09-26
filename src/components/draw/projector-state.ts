export type PublicWinner = {
  id: string;
  name: string;
  status: "RESERVED" | "PUBLISHED";
};

export type ScreenSnapshot = {
  settings: {
    screenTitle: string;
    screenBackgroundPath: string | null;
  };
  quiz?: null | { id: string; status: "LIVE" | "REVIEW" | "FINISHED"; currentQuestionIndex: number | null; question: { id: string; order: number; prompt: string; options: unknown[]; closesAt: string | null; correctOption?: number; explanation?: string | null } | null };
  round: null | {
    id: string;
    status: "LOCKED" | "DRAWN" | "PUBLISHED";
    version: number;
    prizeName: string;
    prizeImagePath: string | null;
    groupName: string;
    candidates: string[];
    winners: PublicWinner[];
  };
};

export type ProjectorState = {
  settings: ScreenSnapshot["settings"];
  phase: "idle" | "rolling" | "revealed" | "published";
  roundId: string | null;
  version: number;
  prizeName: string;
  prizeImagePath: string | null;
  groupName: string;
  candidates: string[];
  winners: PublicWinner[];
};

export function createProjectorState(
  settings: ScreenSnapshot["settings"],
): ProjectorState {
  return {
    settings,
    phase: "idle",
    roundId: null,
    version: 0,
    prizeName: "",
    prizeImagePath: null,
    groupName: "",
    candidates: [],
    winners: [],
  };
}

export function restoreProjectorState(
  current: ProjectorState,
  snapshot: ScreenSnapshot,
): ProjectorState {
  const round = snapshot.round;
  if (!round) {
    return createProjectorState(snapshot.settings);
  }
  if (current.roundId === round.id && current.version > round.version) return current;

  return {
    settings: snapshot.settings,
    phase:
      round.status === "LOCKED"
        ? "rolling"
        : round.status === "DRAWN"
          ? "revealed"
          : "published",
    roundId: round.id,
    version: round.version,
    prizeName: round.prizeName,
    prizeImagePath: round.prizeImagePath,
    groupName: round.groupName,
    candidates: round.candidates,
    winners: round.winners,
  };
}
