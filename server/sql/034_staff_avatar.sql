-- Staff profile picture shown in the sidebar (a small JPEG data URL). Additive and idempotent.
ALTER TABLE "StaffUser" ADD COLUMN IF NOT EXISTS "avatar" TEXT;
