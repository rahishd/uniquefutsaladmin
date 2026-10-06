# Admin server

Express + TypeScript + Prisma. It uses the **same PostgreSQL database as the customer backend**; `prisma/schema.prisma` mirrors the customer schema (top part, never edit) and adds three admin tables (`StaffUser`, `AdminAuditLog`, `SlotBlock`) at the bottom.

## Data safety
1. Outside production `DATABASE_URL` must be local (`src/config/env.ts` refuses otherwise). Never put the real database address in a dev `.env`.
2. Production tables are created only by `npm run db:migrate` (`sql/*.sql`: additive, `IF NOT EXISTS`, admin tables only). Never run `prisma migrate`, `db push` or `migrate reset` against the real database. `npm run db:push` refuses non-local databases.
3. Customer records are never deleted: cancels keep the row, suspend flips `isActive`.
4. Secrets only in `server/.env` (git-ignored). `ADMIN_JWT_SECRET` differs from the customer app's secret, so a customer token can never open the admin API.
5. Money and points rules are re-implemented from the customer backend (`src/lib/customer-effects.ts`). When the customer rules change, change them here too (the tests cover the current rules).

## Run locally
```bash
cd server
npm install
cp .env.example .env        # set ADMIN_JWT_SECRET (32+ random chars), OWNER_EMAIL, OWNER_PASSWORD
npm run db:local            # throw-away PostgreSQL on :5441 (leave running)
npm run db:push             # builds all tables in the LOCAL database
npm run create-owner        # first owner account, then delete OWNER_PASSWORD from .env
npm run dev                 # http://localhost:5100/api
npm test                    # 38 tests against the local unique_test database (run db:push for it first, see below)
```
`db:push` only suits an empty local database: on a dev database that already has data and the `_admin_migrations` table, Prisma refuses (it would drop that table), so apply admin changes with `npm run db:migrate` instead (this is also how production gets them).

For the test database: `DATABASE_URL=postgresql://unique:unique_dev_pw@localhost:5441/unique_test?schema=public ADMIN_JWT_SECRET=<32+ chars> NODE_ENV=test npm run db:push`.

Endpoints: `../docs/API.md`.
