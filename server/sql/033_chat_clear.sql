-- Delete a whole chat for myself (customer app): when the member did it. Mirrors customer migration 20261114000001. Additive and idempotent.
ALTER TABLE "ChatMember" ADD COLUMN IF NOT EXISTS "clearedAt" TIMESTAMP(3);
