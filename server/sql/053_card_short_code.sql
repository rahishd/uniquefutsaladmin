-- Partner Marketplace: the short 4-digit code a customer shows at the partner (the long code stays as the unique internal key). Additive.
ALTER TABLE "MarketplaceRedemption" ADD COLUMN IF NOT EXISTS "shortCode" TEXT;
CREATE INDEX IF NOT EXISTS "MarketplaceRedemption_partnerId_shortCode_status_idx" ON "MarketplaceRedemption"("partnerId", "shortCode", "status");
