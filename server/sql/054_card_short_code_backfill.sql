-- Partner Marketplace: give every card made before the 4-digit codes a 4-digit code too (unique among the partner's cards still waiting).
-- Only touches cards that have no short code yet, so it is safe to run again. Additive: nothing is removed.
DO $$
DECLARE r RECORD; c TEXT; n INT;
BEGIN
  FOR r IN SELECT "id", "partnerId", "status" FROM "MarketplaceRedemption" WHERE "shortCode" IS NULL ORDER BY "createdAt" LOOP
    n := 0;
    LOOP
      c := lpad((floor(random() * 10000))::int::text, 4, '0');
      EXIT WHEN r."status" <> 'active' OR NOT EXISTS (SELECT 1 FROM "MarketplaceRedemption" x WHERE x."partnerId" = r."partnerId" AND x."shortCode" = c AND x."status" = 'active');
      n := n + 1;
      EXIT WHEN n > 300;
    END LOOP;
    UPDATE "MarketplaceRedemption" SET "shortCode" = c WHERE "id" = r."id";
  END LOOP;
END $$;
