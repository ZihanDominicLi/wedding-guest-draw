export type LiveEventType =
  | "guest.changed"
  | "grouping.changed"
  | "round.changed"
  | "screen.presence"
  | "health.changed"
  | "quiz.changed"
  | "quiz.question"
  | "quiz.answer";

export type LiveScope = "admin" | "screen";

export type LiveEvent = {
  id: number;
  type: LiveEventType;
  scope: LiveScope;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type NewLiveEvent = Omit<LiveEvent, "id" | "createdAt">;
