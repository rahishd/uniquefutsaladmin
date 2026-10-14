-- Corporate Network logos. The table is owned by the customer backend; this makes sure it exists when only the admin setup was run.
CREATE TABLE IF NOT EXISTS "SitePartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SitePartner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SitePartner_mediaId_key" ON "SitePartner"("mediaId");
CREATE INDEX IF NOT EXISTS "SitePartner_visible_sortOrder_idx" ON "SitePartner"("visible", "sortOrder");
