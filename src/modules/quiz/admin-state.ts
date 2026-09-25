export type QuizSessionStats = {
  id: string;
  participantCount: number;
  submittedCount: number;
  skippedCount: number;
  completedCount: number;
  averageScore: number;
};

export function mergeQuizSessionStats<T extends { id: string }>(
  sessions: readonly T[],
  stats: readonly QuizSessionStats[],
): T[] {
  const statsById = new Map(stats.map((item) => [item.id, item]));
  return sessions.map((session) => {
    const next = statsById.get(session.id);
    return next ? { ...session, ...next } : session;
  });
}
