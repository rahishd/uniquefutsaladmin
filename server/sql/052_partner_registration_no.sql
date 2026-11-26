-- Partner Marketplace: the partner company's registration number. Additive and idempotent.
ALTER TABLE "MarketplacePartner" ADD COLUMN IF NOT EXISTS "registrationNo" TEXT;
