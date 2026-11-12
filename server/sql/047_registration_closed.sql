-- The organizer can close team registration of a tournament by hand (the customer app then refuses new teams). Additive and idempotent.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "registrationClosed" BOOLEAN NOT NULL DEFAULT false;
