-- How a goods due was paid (cash / online), so the Inventory report can count the money on the day it was collected.
ALTER TABLE "GoodsDue" ADD COLUMN IF NOT EXISTS "cashAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GoodsDue" ADD COLUMN IF NOT EXISTS "onlineAmount" INTEGER NOT NULL DEFAULT 0;
-- dues paid before this column existed: take the method from the bill when it was one method (a split bill stays unknown and counts as cash)
UPDATE "GoodsDue" d SET "cashAmount" = CASE WHEN c."paymentMethod" = 'online' THEN 0 ELSE d."amount" END, "onlineAmount" = CASE WHEN c."paymentMethod" = 'online' THEN d."amount" ELSE 0 END
FROM "Checkout" c WHERE d."checkoutCode" = c."code" AND d."status" = 'paid' AND d."cashAmount" = 0 AND d."onlineAmount" = 0;
