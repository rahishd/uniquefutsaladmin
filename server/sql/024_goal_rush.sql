-- Unique Goal Rush games and shots. The customer backend owns it (migration 20261028000001_goal_rush); same definition with IF NOT EXISTS. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "GoalRushGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "shotsTaken" INTEGER NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "misses" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "rewardId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastShotAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "GoalRushGame_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GoalRushGame_userId_day_idx" ON "GoalRushGame"("userId", "day");
CREATE INDEX IF NOT EXISTS "GoalRushGame_status_startedAt_idx" ON "GoalRushGame"("status", "startedAt");
CREATE INDEX IF NOT EXISTS "GoalRushGame_day_idx" ON "GoalRushGame"("day");

CREATE TABLE IF NOT EXISTS "GoalRushShot" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "no" INTEGER NOT NULL,
    "aimX" DOUBLE PRECISION NOT NULL,
    "aimY" DOUBLE PRECISION NOT NULL,
    "power" DOUBLE PRECISION NOT NULL,
    "ballX" DOUBLE PRECISION NOT NULL,
    "ballY" DOUBLE PRECISION NOT NULL,
    "keeper" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalRushShot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GoalRushShot_gameId_no_key" ON "GoalRushShot"("gameId", "no");

DO $$ BEGIN
  ALTER TABLE "GoalRushShot" ADD CONSTRAINT "GoalRushShot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "GoalRushGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
