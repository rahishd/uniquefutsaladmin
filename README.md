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

## Run the frontend
```bash
cd web
cp .env.example .env.local     # set NEXT_PUBLIC_API_URL (public address only, no secrets)
npm install
npm run dev                    # http://localhost:3000
```
Every module in `web/lib/nav.ts` already has a page (sidebar, dashboard card and a placeholder listing what the customer app offers, what staff will do, and which API endpoints exist or must be built). To build a real page, add `web/app/(dashboard)/<slug>/page.tsx`; it overrides the placeholder.
