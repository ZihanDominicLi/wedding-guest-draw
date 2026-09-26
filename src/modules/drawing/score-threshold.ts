export const MAX_QUIZ_SCORE = 10;

export function resolveScoreThreshold(
  scores: number[],
  initialThreshold = MAX_QUIZ_SCORE,
  winnerCount: number,
  step = 1,
) {
  if (!Number.isInteger(initialThreshold) || initialThreshold < 0) throw new Error("Invalid initial score threshold");
  if (!Number.isInteger(winnerCount) || winnerCount < 1) throw new Error("Invalid winner count");
  if (!Number.isInteger(step) || step < 1) throw new Error("Invalid score threshold step");
  const completedScores = scores.filter((score) => Number.isInteger(score) && score >= 0);
  let actualThreshold = initialThreshold;
  let fallbackCount = 0;
  const eligibleCount = () => completedScores.filter((score) => score >= actualThreshold).length;
  while (eligibleCount() < winnerCount && actualThreshold > 0) {
    actualThreshold = Math.max(0, actualThreshold - step);
    fallbackCount += 1;
  }
  return { actualThreshold, fallbackCount, eligibleCount: eligibleCount() };
}
