-- Staff devices that get alerts while the admin portal is closed (Web Push). Additive and idempotent.
CREATE TABLE IF NOT EXISTS "StaffPushSubscription" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffPushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffPushSubscription_endpoint_key" ON "StaffPushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "StaffPushSubscription_staffId_idx" ON "StaffPushSubscription"("staffId");
