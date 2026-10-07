-- Tournament page. "MatchFollow" belongs to the customer backend (migration 20261017000001_match_follow): same definition with IF NOT EXISTS.
-- "MatchGoal" (who scored, when) and "TournamentHostLink" (the private link a match-day host uses) are admin-owned. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "MatchFollow" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchFollow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchFollow_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MatchFollow_userId_matchId_key" ON "MatchFollow"("userId", "matchId");
CREATE INDEX IF NOT EXISTS "MatchFollow_matchId_idx" ON "MatchFollow"("matchId");

CREATE TABLE IF NOT EXISTS "MatchGoal" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "minute" INTEGER,
  "scorer" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchGoal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatchGoal_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TournamentMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MatchGoal_matchId_idx" ON "MatchGoal"("matchId");

CREATE TABLE IF NOT EXISTS "TournamentHostLink" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentHostLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TournamentHostLink_token_key" ON "TournamentHostLink"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "TournamentHostLink_tournamentId_key" ON "TournamentHostLink"("tournamentId");
