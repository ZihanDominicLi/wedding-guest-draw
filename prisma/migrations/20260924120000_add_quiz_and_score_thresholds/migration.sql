-- Add the quiz session model and score-aware draw configuration.
CREATE TYPE "QuizSessionStatus" AS ENUM ('DRAFT', 'READY', 'LIVE', 'REVIEW', 'FINISHED', 'CANCELLED');
CREATE TYPE "QuizParticipantStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DISQUALIFIED');

CREATE TABLE "quiz_session" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "QuizSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "questionCount" INTEGER NOT NULL DEFAULT 10,
    "defaultTimeLimitSeconds" INTEGER NOT NULL DEFAULT 30,
    "currentQuestionIndex" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quiz_session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_question" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctOption" INTEGER NOT NULL,
    "explanation" TEXT,
    "timeLimitSeconds" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quiz_question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_participant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "QuizParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "score" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quiz_participant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_answer" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOption" INTEGER,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "isCorrect" BOOLEAN,
    "score" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_answer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "guest"
    ADD COLUMN "quizScore" INTEGER,
    ADD COLUMN "quizCompletedAt" TIMESTAMP(3),
    ADD COLUMN "quizSessionId" TEXT;

ALTER TABLE "draw_round"
    ADD COLUMN "scoreThreshold" INTEGER,
    ADD COLUMN "scoreFallbackStep" INTEGER DEFAULT 1,
    ADD COLUMN "actualScoreThreshold" INTEGER,
    ADD COLUMN "scoreFallbackCount" INTEGER;

CREATE UNIQUE INDEX "quiz_participant_tokenHash_key" ON "quiz_participant"("tokenHash");
CREATE UNIQUE INDEX "quiz_question_sessionId_order_key" ON "quiz_question"("sessionId", "order");
CREATE UNIQUE INDEX "quiz_participant_sessionId_guestId_key" ON "quiz_participant"("sessionId", "guestId");
CREATE UNIQUE INDEX "quiz_answer_participantId_questionId_key" ON "quiz_answer"("participantId", "questionId");

CREATE INDEX "quiz_session_status_createdAt_idx" ON "quiz_session"("status", "createdAt");
CREATE INDEX "quiz_question_sessionId_order_idx" ON "quiz_question"("sessionId", "order");
CREATE INDEX "quiz_participant_guestId_status_idx" ON "quiz_participant"("guestId", "status");
CREATE INDEX "quiz_answer_questionId_submittedAt_idx" ON "quiz_answer"("questionId", "submittedAt");
CREATE INDEX "guest_quizSessionId_quizScore_idx" ON "guest"("quizSessionId", "quizScore");

ALTER TABLE "quiz_question"
    ADD CONSTRAINT "quiz_question_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "quiz_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_participant"
    ADD CONSTRAINT "quiz_participant_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "quiz_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_participant"
    ADD CONSTRAINT "quiz_participant_guestId_fkey"
    FOREIGN KEY ("guestId") REFERENCES "guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_answer"
    ADD CONSTRAINT "quiz_answer_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "quiz_participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_answer"
    ADD CONSTRAINT "quiz_answer_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "quiz_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest"
    ADD CONSTRAINT "guest_quizSessionId_fkey"
    FOREIGN KEY ("quizSessionId") REFERENCES "quiz_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
