-- The customer tables "ContentMedia", "SiteGallery" and "SiteAd" belong to the customer backend (migration 20261012000001_site_content).
-- Same definitions with IF NOT EXISTS: does nothing where that migration already ran, and gives a local admin database the tables.
CREATE TABLE IF NOT EXISTS "ContentMedia" (
  "id" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "bytes" INTEGER NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentMedia_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "SiteGallery" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "caption" TEXT,
  "mediaId" TEXT NOT NULL,
  "orientation" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteGallery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SiteGallery_mediaId_key" ON "SiteGallery"("mediaId");
CREATE INDEX IF NOT EXISTS "SiteGallery_visible_sortOrder_idx" ON "SiteGallery"("visible", "sortOrder");
CREATE TABLE IF NOT EXISTS "SiteAd" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "linkUrl" TEXT,
  "placement" TEXT NOT NULL,
  "displaySeconds" INTEGER NOT NULL DEFAULT 6,
  "popupDelaySeconds" INTEGER NOT NULL DEFAULT 3,
  "popupFrequency" TEXT NOT NULL DEFAULT 'day',
  "startDate" TEXT,
  "endDate" TEXT,
  "dailyStart" TEXT,
  "dailyEnd" TEXT,
  "days" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "priority" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteAd_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SiteAd_mediaId_key" ON "SiteAd"("mediaId");
CREATE INDEX IF NOT EXISTS "SiteAd_placement_active_idx" ON "SiteAd"("placement", "active");
