-- Website visits (one row per visitor per day, anonymous). The customer backend owns it (migration 20261016000001_site_visits); same definition with IF NOT EXISTS. Additive and idempotent.
CREATE TABLE IF NOT EXISTS "SiteVisit" (
  "id" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "visitor" TEXT NOT NULL,
  "registered" BOOLEAN NOT NULL DEFAULT false,
  "pages" INTEGER NOT NULL DEFAULT 1,
  "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SiteVisit_day_visitor_key" ON "SiteVisit"("day", "visitor");
CREATE INDEX IF NOT EXISTS "SiteVisit_day_idx" ON "SiteVisit"("day");
