-- Partner Marketplace: businesses (cafes, swimming pools ...) that give Unique Futsal customers a discount for loyalty points.
-- A redemption spends the customer's points and makes a card with a code to show at the partner. Additive and idempotent
-- (the admin portal mirrors it in sql/045). The admin portal manages partners; the partner's own dashboard link uses "token".
CREATE TABLE IF NOT EXISTS "MarketplacePartner" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "contactName" TEXT,
  "contactPhone" TEXT,
  "about" TEXT,
  "agreementStart" TEXT NOT NULL,
  "agreementEnd" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "bannerMediaId" TEXT,
  "token" TEXT NOT NULL,
  "tokenActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplacePartner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplacePartner_token_key" ON "MarketplacePartner"("token");

CREATE TABLE IF NOT EXISTS "MarketplaceOffer" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "discountText" TEXT NOT NULL,
  "pointsCost" DECIMAL(8,1) NOT NULL,
  "maxPerCustomer" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketplaceOffer_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "MarketplacePartner"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceOffer_partnerId_code_key" ON "MarketplaceOffer"("partnerId", "code");
CREATE INDEX IF NOT EXISTS "MarketplaceOffer_partnerId_idx" ON "MarketplaceOffer"("partnerId");

CREATE TABLE IF NOT EXISTS "MarketplaceRedemption" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "customerName" TEXT,
  "points" DECIMAL(8,1) NOT NULL,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "spent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "MarketplaceRedemption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketplaceRedemption_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "MarketplacePartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MarketplaceRedemption_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MarketplaceOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceRedemption_code_key" ON "MarketplaceRedemption"("code");
CREATE INDEX IF NOT EXISTS "MarketplaceRedemption_partnerId_createdAt_idx" ON "MarketplaceRedemption"("partnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketplaceRedemption_userId_idx" ON "MarketplaceRedemption"("userId");
