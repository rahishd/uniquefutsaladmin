-- Hosted tournaments: the amount charged for each extra service (health insurance, Sky Roof Parafit: a fixed amount; mineral water: the price of one
-- bottle) and the number of mineral water bottles taken so far. Additive and idempotent.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "serviceAmounts" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "waterBottles" INTEGER NOT NULL DEFAULT 0;
