-- Collect Service Payment: funds set aside (charity, maintenance ...) and their deposits. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "ServiceFund" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rate" DOUBLE PRECISION,
    "defaultAmount" INTEGER,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceFund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceFund_name_key" ON "ServiceFund"("name");

CREATE TABLE IF NOT EXISTS "ServiceDeposit" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "depositedOn" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceDeposit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ServiceDeposit_fundId_depositedOn_idx" ON "ServiceDeposit"("fundId", "depositedOn");
CREATE INDEX IF NOT EXISTS "ServiceDeposit_depositedOn_idx" ON "ServiceDeposit"("depositedOn");
DO $$ BEGIN
  ALTER TABLE "ServiceDeposit" ADD CONSTRAINT "ServiceDeposit_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "ServiceFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
