-- Payroll: each staff member's monthly salary (from a month on) and the money given to them (counted toward a payroll month).
-- Whatever is left unpaid carries over to the next month. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "StaffSalary" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "setById" TEXT NOT NULL,
  "setByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffSalary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffSalary_staffId_month_key" ON "StaffSalary"("staffId", "month");
CREATE INDEX IF NOT EXISTS "StaffSalary_staffId_idx" ON "StaffSalary"("staffId");

CREATE TABLE IF NOT EXISTS "StaffPayment" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "note" TEXT,
  "paidById" TEXT NOT NULL,
  "paidByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StaffPayment_staffId_month_idx" ON "StaffPayment"("staffId", "month");
