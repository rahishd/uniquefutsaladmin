-- Tournament organizer accounts: a staff-made sign-in (role "organizer") that opens the Tournament Organizer app for ONE or more hosted
-- tournaments only. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "TournamentOrganizer" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentOrganizer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TournamentOrganizer_staffId_tournamentId_key" ON "TournamentOrganizer"("staffId", "tournamentId");
CREATE INDEX IF NOT EXISTS "TournamentOrganizer_tournamentId_idx" ON "TournamentOrganizer"("tournamentId");
