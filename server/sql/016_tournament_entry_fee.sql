-- The entry fee a team pays to join a tournament (rupees per team, 0 = free). The column is owned by the customer backend.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "entryFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
