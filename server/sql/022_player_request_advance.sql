-- Find Player advance. The customer backend owns it (migration 20261026000001_player_request_advance). Additive and idempotent.
-- pays the advance, and how long the host has to pay once everyone has joined.
ALTER TABLE "PlayerRequest" ADD COLUMN IF NOT EXISTS "courtPrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerRequest" ADD COLUMN IF NOT EXISTS "bookingId" TEXT;
ALTER TABLE "PlayerRequest" ADD COLUMN IF NOT EXISTS "advanceDueAt" TIMESTAMP(3);
