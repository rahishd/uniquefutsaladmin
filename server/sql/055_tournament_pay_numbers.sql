-- Tournaments: where teams send the entry fee (eSewa and Khalti numbers the tournament host fills in; customers see them when they register). Additive.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "esewaNumber" TEXT;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "khaltiNumber" TEXT;
