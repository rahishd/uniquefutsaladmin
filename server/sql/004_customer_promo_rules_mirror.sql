-- The customer table "CustomerPromoRule" belongs to the customer backend (migration 20261008000001_customer_promo_rules).
-- Same definition with IF NOT EXISTS: does nothing where that migration already ran, and gives a local admin database the table.
CREATE TABLE IF NOT EXISTS "CustomerPromoRule" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerPromoRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPromoRule_userId_code_key" ON "CustomerPromoRule"("userId", "code");
CREATE INDEX IF NOT EXISTS "CustomerPromoRule_userId_idx" ON "CustomerPromoRule"("userId");
