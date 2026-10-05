# Unique Futsal Admin

Admin portal for Unique Futsal. One repo, two apps:

| Folder | What | Stack (planned) |
|---|---|---|
| `web/` | Admin frontend (desktop-first, responsive) | Next.js, TypeScript, Tailwind |
| `server/` | Admin API, jobs, tests | Express, TypeScript, Prisma, PostgreSQL |
| `docs/` | Plan, FRD, API reference, runbook | Markdown |

Status: planning. See `docs/PLAN.md`. The portal will be connected to the customer site (`rahishd/uniquefutsalclient`) later.

## Rules
- Development uses a local database only. Never point it at production data.
- No secrets in git (`.env*` is ignored; `.env.example` holds placeholders only).
- Migrations are additive and idempotent. Customer records are never deleted.
- Price, promo, loyalty and payment-status logic live on the server.
