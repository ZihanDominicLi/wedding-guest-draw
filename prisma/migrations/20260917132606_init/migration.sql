-- CreateEnum
CREATE TYPE "GuestRelation" AS ENUM ('GROOM_RELATIVE', 'BRIDE_RELATIVE', 'GROOM_FRIEND', 'BRIDE_FRIEND', 'MUTUAL_FRIEND', 'COLLEAGUE', 'CLASSMATE', 'OTHER');

-- CreateEnum
CREATE TYPE "GroupingRuleKind" AS ENUM ('PRIMARY', 'TAG');

-- CreateEnum
CREATE TYPE "DrawRoundStatus" AS ENUM ('PREPARING', 'LOCKED', 'DRAWN', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WinnerStatus" AS ENUM ('RESERVED', 'PUBLISHED', 'REVOKED');

-- CreateTable
CREATE TABLE "WeddingSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "groomName" TEXT NOT NULL DEFAULT '',
    "brideName" TEXT NOT NULL DEFAULT '',
    "weddingDate" TIMESTAMP(3),
    "venueProvince" TEXT NOT NULL DEFAULT '',
    "venueCity" TEXT NOT NULL DEFAULT '',
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "formalDrawMode" BOOLEAN NOT NULL DEFAULT false,
    "screenTitle" TEXT NOT NULL DEFAULT '我们的婚礼',
    "screenBackgroundPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeddingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_group" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest" (
    "id" TEXT NOT NULL,
    "attendanceNumber" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "phoneLast4" TEXT NOT NULL,
    "collisionDiscriminator" INTEGER NOT NULL DEFAULT 0,
    "relation" "GuestRelation" NOT NULL,
    "childCount" INTEGER NOT NULL DEFAULT 0,
    "originProvince" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "isOutOfTown" BOOLEAN NOT NULL,
    "primaryGroupId" TEXT,
    "matchedRuleId" TEXT,
    "groupLocked" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_tag" (
    "guestId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_tag_pkey" PRIMARY KEY ("guestId","tagId")
);

-- CreateTable
CREATE TABLE "grouping_rule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "GroupingRuleKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL,
    "conditions" JSONB NOT NULL,
    "targetGroupId" TEXT,
    "targetTagId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grouping_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prize" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imagePath" TEXT,
    "plannedWinnerCount" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prize_group" (
    "prizeId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "prize_group_pkey" PRIMARY KEY ("prizeId","groupId")
);

-- CreateTable
CREATE TABLE "draw_round" (
    "id" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "targetGroupId" TEXT NOT NULL,
    "plannedWinnerCount" INTEGER NOT NULL,
    "status" "DrawRoundStatus" NOT NULL DEFAULT 'PREPARING',
    "algorithmVersion" TEXT NOT NULL DEFAULT 'crypto-fy-v1',
    "operatorId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lockedAt" TIMESTAMP(3),
    "drawnAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draw_round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draw_candidate_snapshot" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draw_candidate_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "winner" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "status" "WinnerStatus" NOT NULL DEFAULT 'RESERVED',
    "publishedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "winner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_record" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "responseJson" JSONB,
    "statusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_record" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadsJson" JSONB NOT NULL,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_email_key" ON "admin_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "guest_group_key_key" ON "guest_group"("key");

-- CreateIndex
CREATE UNIQUE INDEX "tag_key_key" ON "tag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "guest_attendanceNumber_key" ON "guest"("attendanceNumber");

-- CreateIndex
CREATE INDEX "guest_primaryGroupId_enabled_idx" ON "guest"("primaryGroupId", "enabled");

-- CreateIndex
CREATE INDEX "guest_checkedInAt_idx" ON "guest"("checkedInAt");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_public_identity_key" ON "guest"("normalizedName", "phoneLast4", "collisionDiscriminator");

-- CreateIndex
CREATE INDEX "guest_tag_tagId_idx" ON "guest_tag"("tagId");

-- CreateIndex
CREATE INDEX "grouping_rule_kind_enabled_priority_idx" ON "grouping_rule"("kind", "enabled", "priority");

-- CreateIndex
CREATE INDEX "prize_group_groupId_idx" ON "prize_group"("groupId");

-- CreateIndex
CREATE INDEX "draw_round_status_createdAt_idx" ON "draw_round"("status", "createdAt");

-- CreateIndex
CREATE INDEX "draw_candidate_snapshot_guestId_idx" ON "draw_candidate_snapshot"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "draw_candidate_snapshot_roundId_guestId_key" ON "draw_candidate_snapshot"("roundId", "guestId");

-- CreateIndex
CREATE INDEX "winner_guestId_status_idx" ON "winner"("guestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "winner_roundId_guestId_key" ON "winner"("roundId", "guestId");

-- One guest can hold at most one active winner reservation across the event.
CREATE UNIQUE INDEX "Winner_one_active_per_guest"
ON "winner" ("guestId")
WHERE "status" IN ('RESERVED', 'PUBLISHED');

-- Domain boundaries that remain valid even if a write bypasses the application.
ALTER TABLE "guest"
  ADD CONSTRAINT "guest_phone_last4_format" CHECK ("phoneLast4" ~ '^[0-9]{4}$'),
  ADD CONSTRAINT "guest_child_count_range" CHECK ("childCount" BETWEEN 0 AND 20);

ALTER TABLE "prize"
  ADD CONSTRAINT "prize_winner_count_positive" CHECK ("plannedWinnerCount" > 0);

ALTER TABLE "draw_round"
  ADD CONSTRAINT "draw_round_winner_count_positive" CHECK ("plannedWinnerCount" > 0);

-- CreateIndex
CREATE INDEX "audit_event_entityType_entityId_createdAt_idx" ON "audit_event"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_event_actorId_createdAt_idx" ON "audit_event"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "idempotency_record_expiresAt_idx" ON "idempotency_record"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_record_scope_key_key" ON "idempotency_record"("scope", "key");

-- CreateIndex
CREATE INDEX "rate_limit_bucket_expiresAt_idx" ON "rate_limit_bucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_bucket_bucketKey_windowStart_key" ON "rate_limit_bucket"("bucketKey", "windowStart");

-- CreateIndex
CREATE INDEX "backup_record_createdAt_idx" ON "backup_record"("createdAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest" ADD CONSTRAINT "guest_primaryGroupId_fkey" FOREIGN KEY ("primaryGroupId") REFERENCES "guest_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest" ADD CONSTRAINT "guest_matchedRuleId_fkey" FOREIGN KEY ("matchedRuleId") REFERENCES "grouping_rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_tag" ADD CONSTRAINT "guest_tag_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_tag" ADD CONSTRAINT "guest_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grouping_rule" ADD CONSTRAINT "grouping_rule_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "guest_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grouping_rule" ADD CONSTRAINT "grouping_rule_targetTagId_fkey" FOREIGN KEY ("targetTagId") REFERENCES "tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grouping_rule" ADD CONSTRAINT "grouping_rule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_group" ADD CONSTRAINT "prize_group_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "prize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_group" ADD CONSTRAINT "prize_group_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "guest_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_round" ADD CONSTRAINT "draw_round_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "prize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_round" ADD CONSTRAINT "draw_round_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "guest_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_round" ADD CONSTRAINT "draw_round_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_candidate_snapshot" ADD CONSTRAINT "draw_candidate_snapshot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "draw_round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_candidate_snapshot" ADD CONSTRAINT "draw_candidate_snapshot_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "winner" ADD CONSTRAINT "winner_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "draw_round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "winner" ADD CONSTRAINT "winner_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "winner" ADD CONSTRAINT "winner_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "prize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
