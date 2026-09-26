ALTER TABLE "guest" ADD COLUMN "registrationTokenHash" TEXT;

CREATE UNIQUE INDEX "guest_registrationTokenHash_key" ON "guest"("registrationTokenHash");

DROP INDEX IF EXISTS "quiz_participant_tokenHash_key";
CREATE INDEX "quiz_participant_tokenHash_idx" ON "quiz_participant"("tokenHash");
