-- The customer tables "AcademySession" and "AcademyEnrollment" belong to the customer backend (migration 20261010000001_children_academy).
-- Same definitions with IF NOT EXISTS: does nothing where that migration already ran, and gives a local admin database the tables.
CREATE TABLE IF NOT EXISTS "AcademySession" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Children''s Academy class',
  "date" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 15,
  "coach" TEXT,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademySession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AcademySession_date_visible_idx" ON "AcademySession"("date", "visible");
CREATE TABLE IF NOT EXISTS "AcademyEnrollment" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "guardianName" TEXT NOT NULL,
  "guardianPhone" TEXT NOT NULL,
  "emergencyPhone" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "childName" TEXT NOT NULL,
  "childKey" TEXT NOT NULL,
  "childAge" INTEGER NOT NULL,
  "healthStatus" TEXT NOT NULL,
  "healthNotes" TEXT,
  "termsVersion" INTEGER NOT NULL,
  "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "cancelledAt" TIMESTAMP(3),
  "cancelledBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademyEnrollment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademyEnrollment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademySession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AcademyEnrollment_code_key" ON "AcademyEnrollment"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "AcademyEnrollment_sessionId_userId_childKey_key" ON "AcademyEnrollment"("sessionId", "userId", "childKey");
CREATE INDEX IF NOT EXISTS "AcademyEnrollment_userId_idx" ON "AcademyEnrollment"("userId");
CREATE INDEX IF NOT EXISTS "AcademyEnrollment_sessionId_status_idx" ON "AcademyEnrollment"("sessionId", "status");
