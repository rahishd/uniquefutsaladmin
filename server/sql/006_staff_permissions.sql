-- Staff accounts get the permissions an admin ticked for them. Additive and idempotent; admin-owned table.
ALTER TABLE "StaffUser" ADD COLUMN IF NOT EXISTS "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
