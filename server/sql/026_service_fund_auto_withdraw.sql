-- Collect Service Payment: automatic daily deposits for percent funds, and withdrawals. Additive and idempotent.
-- A percent fund starts collecting automatically from "autoSince" (the day it was first seen by this version), so what was
-- deposited by hand before stays exactly as it is.
ALTER TABLE "ServiceFund" ADD COLUMN IF NOT EXISTS "autoSince" TEXT;
-- an automatic deposit is one row per fund per day; autoDay is that day (NULL for a deposit made by hand)
ALTER TABLE "ServiceDeposit" ADD COLUMN IF NOT EXISTS "autoDay" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceDeposit_fundId_autoDay_key" ON "ServiceDeposit"("fundId", "autoDay");

-- Money taken out of a fund. Written once, never edited or deleted, like a deposit.
CREATE TABLE IF NOT EXISTS "ServiceWithdrawal" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL,
    "withdrawnOn" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceWithdrawal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceWithdrawal_fundId_withdrawnOn_idx" ON "ServiceWithdrawal"("fundId", "withdrawnOn");
CREATE INDEX IF NOT EXISTS "ServiceWithdrawal_withdrawnOn_idx" ON "ServiceWithdrawal"("withdrawnOn");
DO $$ BEGIN
  ALTER TABLE "ServiceWithdrawal" ADD CONSTRAINT "ServiceWithdrawal_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "ServiceFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
