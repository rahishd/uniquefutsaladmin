-- Fonepay dynamic QR payments made at the counter (admin-owned table). Additive and idempotent.
CREATE TABLE IF NOT EXISTS "FonepayQr" (
  "id" TEXT NOT NULL,
  "prn" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "remarks" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "providerRef" TEXT,
  "purpose" TEXT NOT NULL DEFAULT 'counter',
  "customerPhone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "paidReference" TEXT,
  "consumedAt" TIMESTAMP(3),
  "consumedFor" TEXT,
  CONSTRAINT "FonepayQr_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FonepayQr_prn_key" ON "FonepayQr"("prn");
CREATE INDEX IF NOT EXISTS "FonepayQr_status_createdAt_idx" ON "FonepayQr"("status", "createdAt");
