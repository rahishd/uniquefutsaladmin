-- Website visits: IP address, rough place, device and the signed-in account for each visitor (the customer backend fills them in; migration 20261117000001_site_visit_details). Additive and idempotent.
ALTER TABLE "SiteVisit" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "SiteVisit" ADD COLUMN IF NOT EXISTS "ip" TEXT;
ALTER TABLE "SiteVisit" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "SiteVisit" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "SiteVisit" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "SiteVisit" ADD COLUMN IF NOT EXISTS "deviceType" TEXT;
ALTER TABLE "SiteVisit" ADD COLUMN IF NOT EXISTS "deviceName" TEXT;
ALTER TABLE "SiteVisit" ADD COLUMN IF NOT EXISTS "os" TEXT;
ALTER TABLE "SiteVisit" ADD COLUMN IF NOT EXISTS "browser" TEXT;
