-- Unique Ludo (online board game): games, players, invitations, dice log and daily usage. The customer backend owns it (migration 20261123000001_unique_ludo); same definition with IF NOT EXISTS. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "LudoGame" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'lobby',
  "hostId" TEXT NOT NULL,
  "maxPlayers" INTEGER NOT NULL DEFAULT 4,
  "difficulty" TEXT NOT NULL DEFAULT 'normal',
  "state" JSONB,
  "day" TEXT,
  "actAt" TIMESTAMP(3),
  "turnSeat" INTEGER,
  "winnerSeat" INTEGER,
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LudoGame_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LudoGame_code_key" ON "LudoGame"("code");
CREATE INDEX IF NOT EXISTS "LudoGame_hostId_status_idx" ON "LudoGame"("hostId", "status");
CREATE INDEX IF NOT EXISTS "LudoGame_status_actAt_idx" ON "LudoGame"("status", "actAt");
CREATE INDEX IF NOT EXISTS "LudoGame_status_finishedAt_idx" ON "LudoGame"("status", "finishedAt");

CREATE TABLE IF NOT EXISTS "LudoPlayer" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "seat" INTEGER NOT NULL,
  "userId" TEXT,
  "name" TEXT NOT NULL,
  "isBot" BOOLEAN NOT NULL DEFAULT false,
  "botControl" BOOLEAN NOT NULL DEFAULT false,
  "ready" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'joined',
  "missedTurns" INTEGER NOT NULL DEFAULT 0,
  "disconnectedAt" TIMESTAMP(3),
  "feeEntryId" TEXT,
  "rewardEntryId" TEXT,
  "refundEntryId" TEXT,
  "result" TEXT,
  "rank" INTEGER,
  "captures" INTEGER NOT NULL DEFAULT 0,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LudoPlayer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LudoPlayer_gameId_seat_key" ON "LudoPlayer"("gameId", "seat");
CREATE INDEX IF NOT EXISTS "LudoPlayer_userId_gameId_idx" ON "LudoPlayer"("userId", "gameId");
CREATE INDEX IF NOT EXISTS "LudoPlayer_gameId_idx" ON "LudoPlayer"("gameId");

CREATE TABLE IF NOT EXISTS "LudoInvite" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "inviterId" TEXT NOT NULL,
  "inviteeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'invited',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "LudoInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LudoInvite_gameId_inviteeId_key" ON "LudoInvite"("gameId", "inviteeId");
CREATE INDEX IF NOT EXISTS "LudoInvite_inviteeId_status_idx" ON "LudoInvite"("inviteeId", "status");

CREATE TABLE IF NOT EXISTS "LudoEvent" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "seq" INTEGER NOT NULL,
  "seat" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "value" INTEGER,
  "token" INTEGER,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LudoEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LudoEvent_gameId_seq_key" ON "LudoEvent"("gameId", "seq");

CREATE TABLE IF NOT EXISTS "LudoDailyUsage" (
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "LudoDailyUsage_pkey" PRIMARY KEY ("userId", "day", "mode")
);

DO $$ BEGIN
  ALTER TABLE "LudoPlayer" ADD CONSTRAINT "LudoPlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "LudoGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LudoInvite" ADD CONSTRAINT "LudoInvite_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "LudoGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LudoEvent" ADD CONSTRAINT "LudoEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "LudoGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
