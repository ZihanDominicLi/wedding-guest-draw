export function createQuestionWindow(opensAt: Date, timeLimitSeconds: number): { opensAt: Date; closesAt: Date } {
  return {
    opensAt,
    closesAt: new Date(opensAt.getTime() + timeLimitSeconds * 1_000),
  };
}

/** Returns the first server-side deadline that can close the current question. */
export function effectiveQuestionCloseAt(closesAt: Date | null, scheduledTransitionAt: Date | null): Date | null {
  if (!closesAt) return scheduledTransitionAt;
  if (!scheduledTransitionAt) return closesAt;
  return scheduledTransitionAt < closesAt ? scheduledTransitionAt : closesAt;
}

export function isWithinAnswerWindow(
  opensAt: Date | null,
  closesAt: Date | null,
  receivedAt: Date,
  scheduledCloseAt: Date | null = null,
): boolean {
  if (!opensAt || !closesAt) return false;
  const effectiveCloseAt = effectiveQuestionCloseAt(closesAt, scheduledCloseAt);
  if (!effectiveCloseAt) return false;
  return receivedAt >= opensAt && receivedAt <= effectiveCloseAt;
}
