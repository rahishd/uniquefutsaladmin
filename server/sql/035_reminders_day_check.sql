-- Reminders staff set with a time (popped up in the portal and pushed to phones until someone marks them done), and the owner's
-- daily check of the money received. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "Reminder" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "repeat" TEXT NOT NULL DEFAULT 'none',
  "forStaffId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "doneAt" TIMESTAMP(3),
  "doneByName" TEXT,
  "snoozedUntil" TIMESTAMP(3),
  "lastNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Reminder_status_dueAt_idx" ON "Reminder"("status", "dueAt");

CREATE TABLE IF NOT EXISTS "DayCheck" (
  "id" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "expectedCash" DOUBLE PRECISION NOT NULL,
  "expectedFonepay" DOUBLE PRECISION NOT NULL,
  "receivedCash" DOUBLE PRECISION NOT NULL,
  "receivedFonepay" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  "checkedById" TEXT NOT NULL,
  "checkedByName" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DayCheck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DayCheck_day_key" ON "DayCheck"("day");
