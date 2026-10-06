-- The customer table "Complaint" belongs to the customer backend (its migration 20261007000001_complaints).
-- This is the SAME definition with IF NOT EXISTS, so it does nothing where the customer migration already ran,
-- and gives a local admin database the table it reads. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "Complaint" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "bookingCode" TEXT,
  "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'open',
  "staffReply" TEXT,
  "repliedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Complaint_code_key" ON "Complaint"("code");
CREATE INDEX IF NOT EXISTS "Complaint_userId_idx" ON "Complaint"("userId");
CREATE INDEX IF NOT EXISTS "Complaint_status_createdAt_idx" ON "Complaint"("status", "createdAt");
