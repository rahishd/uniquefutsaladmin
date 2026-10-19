-- Which points a free game voucher spent, so cancelling it can give each part back with its original expiry. Additive and idempotent.
ALTER TABLE "FreeGameVoucher" ADD COLUMN IF NOT EXISTS "spent" TEXT;
