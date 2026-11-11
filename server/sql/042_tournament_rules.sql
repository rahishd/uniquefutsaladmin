-- Tournament rules and regulations: free text the organizer writes for their own tournament (one rule per line). Additive and idempotent.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "rules" TEXT;
