-- The customer tables "InsuranceClaim" and "EmergencyCall", and the emergency contact columns on "User", belong to the
-- customer backend (its migration 20261107000001_insurance_claims). This is the SAME definition with IF NOT EXISTS, so it
-- does nothing where the customer migration already ran, and gives a local admin database what it reads. Additive and idempotent.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emergencyName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emergencyPhone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emergencyRelation" TEXT;

CREATE TABLE IF NOT EXISTS "InsuranceClaim" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "patientName" TEXT NOT NULL,
  "patientPhone" TEXT NOT NULL,
  "witnessName" TEXT NOT NULL,
  "witnessNameNe" TEXT NOT NULL,
  "witnessPhone" TEXT,
  "severity" TEXT NOT NULL,
  "incidentDate" TEXT NOT NULL,
  "description" TEXT,
  "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "staffReply" TEXT,
  "repliedBy" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InsuranceClaim_code_key" ON "InsuranceClaim"("code");
CREATE INDEX IF NOT EXISTS "InsuranceClaim_userId_idx" ON "InsuranceClaim"("userId");
CREATE INDEX IF NOT EXISTS "InsuranceClaim_patientPhone_idx" ON "InsuranceClaim"("patientPhone");
CREATE INDEX IF NOT EXISTS "InsuranceClaim_status_createdAt_idx" ON "InsuranceClaim"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "EmergencyCall" (
  "id" TEXT NOT NULL,
  "callerId" TEXT NOT NULL,
  "patientPhone" TEXT NOT NULL,
  "found" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmergencyCall_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EmergencyCall_callerId_createdAt_idx" ON "EmergencyCall"("callerId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmergencyCall_patientPhone_idx" ON "EmergencyCall"("patientPhone");
