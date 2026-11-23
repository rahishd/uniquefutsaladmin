-- A mirror of the customer backend's SmsLog table (the customer backend writes it; the admin SMS page reads it). Additive and idempotent.
CREATE TABLE IF NOT EXISTS "SmsLog" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "phoneNumber" TEXT NOT NULL,
  "recipientName" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'other',
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerId" TEXT,
  "error" TEXT,
  "bookingCode" TEXT,
  CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SmsLog_createdAt_idx" ON "SmsLog"("createdAt");
CREATE INDEX IF NOT EXISTS "SmsLog_phoneNumber_idx" ON "SmsLog"("phoneNumber");
CREATE INDEX IF NOT EXISTS "SmsLog_kind_idx" ON "SmsLog"("kind");
