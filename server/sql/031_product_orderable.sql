-- Products staff choose to show in the customer app Order list (for people playing a booked game). Additive and idempotent.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "orderable" BOOLEAN NOT NULL DEFAULT false;
