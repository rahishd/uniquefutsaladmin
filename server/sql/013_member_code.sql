-- Membership ID shown to the member and staff (for example MEM-10291). Additive and idempotent: a nullable column plus a unique index.
-- The column sits on the customer table "MembershipSubscription" (customer migration 20261014000001_member_code does the same).
ALTER TABLE "MembershipSubscription" ADD COLUMN IF NOT EXISTS "memberCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "MembershipSubscription_memberCode_key" ON "MembershipSubscription"("memberCode");
