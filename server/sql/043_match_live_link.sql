-- A match's live-stream link (Facebook Live), pasted by the tournament organizer. Additive and idempotent.
ALTER TABLE "TournamentMatch" ADD COLUMN IF NOT EXISTS "liveUrl" TEXT;
