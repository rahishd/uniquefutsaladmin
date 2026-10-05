# Admin portal plan

Decision: ONE repo (`web/` + `server/`). Connecting to the customer site/database comes after the portal is built.

## Phases
1. Foundation: staff accounts and roles (owner, manager, front desk, accountant), login with refresh and rate limit, separate admin JWT secret, audit log on every write, app shell and API client.
2. Operations: live dashboard (today's bookings, "I'm coming" arrivals, pending payments); booking list; walk-in, cancel, complete, no-show; mark paid (court, gamezone, membership, challenge); refunds and reconciliation.
3. Courts and money: price rules, slot blocks, promo CRUD and usage, membership plans/subscriptions, goods sales, expenses, inventory.
4. Customers and community: customer search/profile/suspend; loyalty ledger, adjustments, voucher void; teams, challenge settlement, dispute resolution; tournaments and scores; gamezone catalog; ads, gallery, site info.
5. Communication and reports: broadcast notices/push/SMS; revenue, occupancy, no-show, loyalty-liability reports with PDF/CSV.
6. Hardening: tests for every route (roles + audit), staff runbook, rehearsal on a copy of production data.

Build order: phases 1 and 2 first.

## Reference
Customer-side admin requirements: `FRD/BACKEND-REQUIREMENTS.md` section 4.14 and 7 in the client repo. Old admin screens: client repo tag `legacy-original`, `app/uniquesuperadmin/`.

## Open items (decide before connecting)
- Staff roles beyond owner?
- One court or two?
- Refund handling while eSewa/Fonepay keys do not exist.
- How the admin server shares the customer database/schema.
