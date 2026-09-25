import type { QuizSessionStatus, QuizParticipantStatus } from "@prisma/client";

export type QuizQuestionView = {
  id: string;
  order: number;
  prompt: string;
  options: unknown;
  timeLimitSeconds: number;
  opensAt: string | null;
  closesAt: string | null;
  publishedAt: string | null;
  correctOption?: number;
  explanation?: string | null;
};

export type QuizSessionView = {
  id: string;
  title: string;
  status: QuizSessionStatus;
  questionCount: number;
  defaultTimeLimitSeconds: number;
  currentQuestionIndex: number | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type QuizParticipantView = {
  id: string;
  guestId: string;
  status: QuizParticipantStatus;
  score: number;
  completedAt: string | null;
  currentAnswer: {
    questionId: string;
    selectedOption: number | null;
    accepted: boolean;
    isLate: boolean;
    isCorrect: boolean | null;
    score: number;
    submittedAt: string;
    published: boolean;
    correctOption?: number;
    explanation?: string | null;
  } | null;
};

export class QuizValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuizValidationError";
  }
}

export class QuizStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuizStateError";
  }
}

export class QuizParticipantError extends Error {
  constructor(message = "Quiz participant is not valid") {
    super(message);
    this.name = "QuizParticipantError";
  }
}
