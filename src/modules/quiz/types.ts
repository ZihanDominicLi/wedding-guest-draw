import type {
  EventPhase,
  PendingTransitionStatus,
  QuizParticipantGroup,
  QuizParticipantStatus,
  QuizResultRoundType,
  QuizSessionStatus,
} from "@prisma/client";

export type EventPhaseView = EventPhase;
export type QuizTransitionStatus = PendingTransitionStatus;
export type QuizGroupView = QuizParticipantGroup;
export type QuizResultTypeView = QuizResultRoundType;

export type PendingTransitionView = {
  id: string;
  requestId: string;
  fromPhase: EventPhase;
  toPhase: EventPhase;
  fromQuestionIndex: number | null;
  toQuestionIndex: number | null;
  fromRound: number | null;
  toRound: number | null;
  effectiveAt: string;
  status: PendingTransitionStatus;
};

export type QuizWinnerView = {
  id: string;
  round: number;
  ordinal: number;
  participantId: string;
  displayName: string;
  score: number | null;
};

export type QuizResultRoundView = {
  id: string;
  round: number;
  type: QuizResultRoundType;
  requestedCount: number;
  eligibleCount: number;
  actualCount: number;
  shortage: number;
  actualThreshold: number | null;
  revealedAt: string | null;
  winners: QuizWinnerView[];
};

export type ParticipantAnswerConfirmation = {
  questionId: string;
  submissionId: string;
  selectedOption: number | null;
  accepted: boolean;
  isLate: boolean;
  score: number | null;
  submittedAt: string;
};

export type EventStateView = {
  eventId: string;
  phase: EventPhase;
  version: number;
  questionIndex: number | null;
  round: number | null;
  serverTime: string;
  pendingTransition: PendingTransitionView | null;
  currentQuestion: QuizQuestionView | null;
  me: {
    participantId: string;
    answeredQuestionIds: string[];
    answers: ParticipantAnswerConfirmation[];
    totalScore: number | null;
  } | null;
  results: QuizResultRoundView[];
};

export type AnswerReceipt = {
  submissionId: string;
  questionId: string;
  accepted: boolean;
  selectedOption: number | null;
  isLate: boolean;
  score: number | null;
  submittedAt: string;
};

export type QuizQuestionView = {
  id: string;
  order: number;
  prompt: string;
  options: unknown;
  timeLimitSeconds: number;
  opensAt: string | null;
  closesAt: string | null;
  publishedAt: string | null;
  correctOption?: number | null;
  explanation?: string | null;
};

export type QuizSessionView = {
  id: string;
  title: string;
  status: QuizSessionStatus;
  phase?: EventPhase;
  questionCount: number;
  defaultTimeLimitSeconds: number;
  currentQuestionIndex: number | null;
  currentRound?: number | null;
  version?: number;
  registrationClosedAt?: string | null;
  settledAt?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type QuizParticipantView = {
  id: string;
  guestId: string;
  status: QuizParticipantStatus;
  score: number;
  totalScore?: number | null;
  answeredCount?: number;
  participantGroup?: QuizParticipantGroup;
  hasChildren?: boolean;
  settledAt?: string | null;
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
    correctOption?: number | null;
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
