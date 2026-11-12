-- Partner Marketplace: when and how long the partner's banner shows in the customer app (the same controls as an ad): seconds on screen,
-- priority, on or off, first and last day, hours of the day, weekdays. Additive and idempotent (the admin portal mirrors it in sql/046).
ALTER TABLE "MarketplacePartner" ADD COLUMN IF NOT EXISTS "bannerSeconds" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "MarketplacePartner" ADD COLUMN IF NOT EXISTS "bannerPriority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketplacePartner" ADD COLUMN IF NOT EXISTS "bannerOn" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "MarketplacePartner" ADD COLUMN IF NOT EXISTS "bannerStart" TEXT;
ALTER TABLE "MarketplacePartner" ADD COLUMN IF NOT EXISTS "bannerEnd" TEXT;
ALTER TABLE "MarketplacePartner" ADD COLUMN IF NOT EXISTS "bannerDailyStart" TEXT;
ALTER TABLE "MarketplacePartner" ADD COLUMN IF NOT EXISTS "bannerDailyEnd" TEXT;
ALTER TABLE "MarketplacePartner" ADD COLUMN IF NOT EXISTS "bannerDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
