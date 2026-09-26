DO $$
BEGIN
  CREATE TYPE "EventPhase" AS ENUM ('REGISTRATION', 'QUESTION', 'SETTLING', 'QUIZ_ENDED', 'RESULTS', 'FINISHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PendingTransitionStatus" AS ENUM ('PENDING', 'APPLIED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "QuizParticipantGroup" AS ENUM ('FRIEND', 'ELDER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "QuizResultRoundType" AS ENUM ('ELDER_TOP', 'FRIEND_TOP', 'ELDER_RANDOM', 'FRIEND_RANDOM', 'WITH_CHILD_RANDOM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "quiz_session"
  ADD COLUMN "phase" "EventPhase" NOT NULL DEFAULT 'REGISTRATION',
  ADD COLUMN "currentRound" INTEGER,
  ADD COLUMN "registrationClosedAt" TIMESTAMP(3),
  ADD COLUMN "scoringRuleVersion" TEXT NOT NULL DEFAULT 'wedding-v1',
  ADD COLUMN "settledAt" TIMESTAMP(3);

ALTER TABLE "quiz_participant"
  ADD COLUMN "participantGroup" "QuizParticipantGroup" NOT NULL DEFAULT 'FRIEND',
  ADD COLUMN "hasChildren" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "totalScore" INTEGER,
  ADD COLUMN "answeredCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "settledAt" TIMESTAMP(3);

ALTER TABLE "quiz_answer"
  ADD COLUMN "submissionId" TEXT;

CREATE TABLE "pending_transition" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "fromPhase" "EventPhase" NOT NULL,
  "toPhase" "EventPhase" NOT NULL,
  "fromQuestionIndex" INTEGER,
  "toQuestionIndex" INTEGER,
  "fromRound" INTEGER,
  "toRound" INTEGER,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "status" "PendingTransitionStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "pending_transition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_result_round" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "type" "QuizResultRoundType" NOT NULL,
  "requestedCount" INTEGER NOT NULL,
  "eligibleCount" INTEGER NOT NULL,
  "actualCount" INTEGER NOT NULL,
  "shortage" INTEGER NOT NULL DEFAULT 0,
  "actualThreshold" INTEGER,
  "ruleVersion" TEXT NOT NULL,
  "candidateSnapshot" JSONB NOT NULL,
  "sameScoreOrder" JSONB,
  "revealedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quiz_result_round_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_winner" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "resultRoundId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "displayNameSnapshot" TEXT NOT NULL,
  "scoreSnapshot" INTEGER,
  "candidateSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quiz_winner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quiz_session_event_state_idx" ON "quiz_session"("phase", "version", "updatedAt");
CREATE UNIQUE INDEX "quiz_answer_submissionId_key" ON "quiz_answer"("submissionId");
CREATE INDEX "quiz_participant_session_group_score_idx" ON "quiz_participant"("sessionId", "participantGroup", "totalScore");
CREATE INDEX "quiz_answer_participant_question_idx" ON "quiz_answer"("participantId", "questionId");
CREATE INDEX "quiz_answer_participant_question_submitted_idx" ON "quiz_answer"("participantId", "questionId", "submittedAt");
CREATE UNIQUE INDEX "pending_transition_event_request_key" ON "pending_transition"("eventId", "requestId");
CREATE INDEX "pending_transition_event_status_effective_idx" ON "pending_transition"("eventId", "status", "effectiveAt");
CREATE UNIQUE INDEX "pending_transition_one_pending_per_event_key" ON "pending_transition"("eventId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "quiz_result_round_event_round_key" ON "quiz_result_round"("eventId", "round");
CREATE INDEX "quiz_result_round_event_revealed_idx" ON "quiz_result_round"("eventId", "revealedAt");
CREATE UNIQUE INDEX "quiz_winner_round_ordinal_key" ON "quiz_winner"("resultRoundId", "ordinal");
CREATE UNIQUE INDEX "quiz_winner_round_participant_key" ON "quiz_winner"("resultRoundId", "participantId");
CREATE UNIQUE INDEX "quiz_winner_event_participant_key" ON "quiz_winner"("eventId", "participantId");
CREATE INDEX "quiz_winner_event_round_idx" ON "quiz_winner"("eventId", "resultRoundId");

ALTER TABLE "pending_transition"
  ADD CONSTRAINT "pending_transition_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "quiz_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quiz_result_round"
  ADD CONSTRAINT "quiz_result_round_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "quiz_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quiz_winner"
  ADD CONSTRAINT "quiz_winner_resultRoundId_fkey"
  FOREIGN KEY ("resultRoundId") REFERENCES "quiz_result_round"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "quiz_winner_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "quiz_participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
