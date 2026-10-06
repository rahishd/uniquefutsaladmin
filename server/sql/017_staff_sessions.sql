-- Staff sign-out on password change: every sign-in token carries the account's session number, and a password change raises it.
-- Additive and idempotent.
ALTER TABLE "StaffUser" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
