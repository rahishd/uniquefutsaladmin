-- Digital ID. "DigitalId" belongs to the customer backend (migration 20261015000001_digital_id); same definition with IF NOT EXISTS.
-- "MembershipAttendance" is admin-owned. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "DigitalId" (
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotatedAt" TIMESTAMP(3),
  CONSTRAINT "DigitalId_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DigitalId_token_key" ON "DigitalId"("token");

CREATE TABLE IF NOT EXISTS "MembershipAttendance" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "recordedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipAttendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MembershipAttendance_subscriptionId_date_key" ON "MembershipAttendance"("subscriptionId", "date");
CREATE INDEX IF NOT EXISTS "MembershipAttendance_userId_date_idx" ON "MembershipAttendance"("userId", "date");
