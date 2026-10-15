-- Find Player requests ("I need N players") and who joined. The customer backend owns it (migration 20261025000001_player_requests); same definition with IF NOT EXISTS. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "PlayerRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "playersNeeded" INTEGER NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PlayerRequest_date_status_idx" ON "PlayerRequest"("date", "status");
CREATE INDEX IF NOT EXISTS "PlayerRequest_userId_createdAt_idx" ON "PlayerRequest"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "PlayerRequestJoin" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerRequestJoin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerRequestJoin_requestId_userId_key" ON "PlayerRequestJoin"("requestId", "userId");
CREATE INDEX IF NOT EXISTS "PlayerRequestJoin_userId_idx" ON "PlayerRequestJoin"("userId");

DO $$ BEGIN
  ALTER TABLE "PlayerRequestJoin" ADD CONSTRAINT "PlayerRequestJoin_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PlayerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
