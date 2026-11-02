-- The customer table "PointsOffer" belongs to the customer backend (migration 20261119000001_points_offer).
-- Same definition with IF NOT EXISTS: does nothing where that migration already ran, and gives a local admin database the table.
-- Staff create an offer (Loyalty Points > Top up points); the customer takes it in the app.
CREATE TABLE IF NOT EXISTS "PointsOffer" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "points" DECIMAL(8,1) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  CONSTRAINT "PointsOffer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PointsOffer_userId_status_idx" ON "PointsOffer"("userId", "status");
