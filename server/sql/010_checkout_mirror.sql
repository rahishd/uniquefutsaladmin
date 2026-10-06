-- The customer table "Checkout" belongs to the customer backend (migration 20261013000001_checkouts).
-- Same definition with IF NOT EXISTS: does nothing where that migration already ran, and gives a local admin database the table.
CREATE TABLE IF NOT EXISTS "Checkout" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "goodsTotal" INTEGER NOT NULL DEFAULT 0,
  "gameTotal" INTEGER NOT NULL DEFAULT 0,
  "total" INTEGER NOT NULL,
  "lines" TEXT NOT NULL,
  "bookingIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "goodsSaleId" TEXT,
  "pointsGoods" DECIMAL(8,1) NOT NULL DEFAULT 0,
  "pointsGames" DECIMAL(8,1) NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Checkout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Checkout_code_key" ON "Checkout"("code");
CREATE INDEX IF NOT EXISTS "Checkout_userId_createdAt_idx" ON "Checkout"("userId", "createdAt");
