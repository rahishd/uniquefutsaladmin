-- Tournament prizes: the places (1st, 2nd, ...) with a cash prize, the trophy and a note, kept as JSON. The organizer fills them in.
-- Additive and idempotent.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "prizes" JSONB NOT NULL DEFAULT '[]'::jsonb;
