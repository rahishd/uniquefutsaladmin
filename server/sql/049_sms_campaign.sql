-- Mass texts sent from the admin SMS page, and their progress. Admin-owned, additive and idempotent.
CREATE TABLE IF NOT EXISTS "SmsCampaign" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "audienceLabel" TEXT NOT NULL,
  "total" INTEGER NOT NULL,
  "sent" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'sending',
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "SmsCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SmsCampaign_createdAt_idx" ON "SmsCampaign"("createdAt");
