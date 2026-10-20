-- The live clock of a Gamezone session: staff press Start, the booked hours run, and any minutes after that are billed per minute.
-- Admin-owned (the customer's GzBooking table is not changed). Additive and idempotent.
CREATE TABLE IF NOT EXISTS "GzClock" (
  "bookingCode" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "bookedMinutes" INTEGER NOT NULL,
  "hourlyRate" INTEGER NOT NULL,
  "extraMinutes" INTEGER NOT NULL DEFAULT 0,
  "extraCharge" INTEGER NOT NULL DEFAULT 0,
  "prepaid" INTEGER NOT NULL DEFAULT 0,
  "startedBy" TEXT NOT NULL,
  CONSTRAINT "GzClock_pkey" PRIMARY KEY ("bookingCode")
);
CREATE INDEX IF NOT EXISTS "GzClock_endedAt_idx" ON "GzClock"("endedAt");
