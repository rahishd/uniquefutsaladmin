-- Hosted tournaments: the extra services staff offer with the event (health insurance, Sky Roof Parafit, mineral water), switched on or off.
-- Additive and idempotent.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
