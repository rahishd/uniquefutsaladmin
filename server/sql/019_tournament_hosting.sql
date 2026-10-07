-- A tournament the venue HOSTS for a manager: details, the days and hours the court is held, the bill and the payments.
-- The columns and "TournamentDay" sit on customer-side tables (customer migration 20261019000001_tournament_hosting does the same,
-- with IF NOT EXISTS), so the customer app can show the event. The bill and payments are admin-only. Additive and idempotent.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "hostedEvent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "hostName" TEXT;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "hostPhone" TEXT;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "minRate" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "billClosedAt" TIMESTAMP(3);
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

CREATE TABLE IF NOT EXISTS "TournamentDay" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "startHour" INTEGER NOT NULL,
  "endHour" INTEGER NOT NULL,
  "blockIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "TournamentDay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentDay_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TournamentDay_tournamentId_date_key" ON "TournamentDay"("tournamentId", "date");

CREATE TABLE IF NOT EXISTS "TournamentBillLine" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "productId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" INTEGER NOT NULL DEFAULT 0,
  "amount" INTEGER NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentBillLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentBillLine_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "TournamentBillLine_tournamentId_idx" ON "TournamentBillLine"("tournamentId");

CREATE TABLE IF NOT EXISTS "TournamentPayment" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "cash" INTEGER NOT NULL DEFAULT 0,
  "fonepay" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "receivedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentPayment_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "TournamentPayment_tournamentId_idx" ON "TournamentPayment"("tournamentId");
