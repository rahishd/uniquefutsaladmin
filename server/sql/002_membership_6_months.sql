-- 6-month membership prices. Additive and idempotent. These columns sit on the customer table "MembershipPlan";
-- the customer app ignores them until it is updated to offer a 6-month duration (see docs/API.md).
ALTER TABLE "MembershipPlan" ADD COLUMN IF NOT EXISTS "price6MonthsMorning" INTEGER;
ALTER TABLE "MembershipPlan" ADD COLUMN IF NOT EXISTS "price6MonthsDay" INTEGER;
ALTER TABLE "MembershipPlan" ADD COLUMN IF NOT EXISTS "price6MonthsEvening" INTEGER;
ALTER TABLE "MembershipPlan" ADD COLUMN IF NOT EXISTS "discount6MonthsMorning" INTEGER DEFAULT 0;
ALTER TABLE "MembershipPlan" ADD COLUMN IF NOT EXISTS "discount6MonthsDay" INTEGER DEFAULT 0;
ALTER TABLE "MembershipPlan" ADD COLUMN IF NOT EXISTS "discount6MonthsEvening" INTEGER DEFAULT 0;
