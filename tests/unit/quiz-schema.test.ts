import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("persistent wedding flow schema", () => {
  it("declares the unified event phases", () => {
    expect(schema).toMatch(/enum EventPhase\s*\{[\s\S]*REGISTRATION[\s\S]*QUESTION[\s\S]*SETTLING[\s\S]*QUIZ_ENDED[\s\S]*RESULTS[\s\S]*FINISHED[\s\S]*\}/);
  });

  it("persists one pending transition per quiz session and its effective time", () => {
    expect(schema).toMatch(/model PendingTransition\s*\{/);
    expect(schema).toMatch(/eventId\s+String/);
    expect(schema).toMatch(/effectiveAt\s+DateTime/);
    expect(schema).toMatch(/@@unique\(\[eventId, requestId\]\)/);
    expect(schema).toMatch(/@@index\(\[eventId, status, effectiveAt\]\)/);
  });

  it("persists frozen result rounds and globally unique winners", () => {
    expect(schema).toMatch(/model QuizResultRound\s*\{/);
    expect(schema).toMatch(/model QuizWinner\s*\{/);
    expect(schema).toMatch(/@@unique\(\[eventId, round\]\)/);
    expect(schema).toMatch(/@@unique\(\[eventId, participantId\]\)/);
    expect(schema).toMatch(/revealedAt\s+DateTime\?/);
  });

  it("keeps settlement score nullable until the participant is settled", () => {
    expect(schema).toMatch(/model QuizParticipant\s*\{[\s\S]*totalScore\s+Int\?/);
    expect(schema).toMatch(/settledAt\s+DateTime\?/);
    expect(schema).toMatch(/model QuizSession\s*\{[\s\S]*phase\s+EventPhase/);
    expect(schema).toMatch(/registrationClosedAt\s+DateTime\?/);
  });

  it("stores answer submission identifiers for idempotent retries", () => {
    expect(schema).toMatch(/model QuizAnswer\s*\{[\s\S]*submissionId\s+String\?/);
    expect(schema).toMatch(/@@unique\(\[submissionId\]\)/);
    expect(schema).toMatch(/@@index\(\[participantId, questionId\]/);
  });
});
