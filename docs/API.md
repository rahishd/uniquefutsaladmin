# Admin API

Base URL `http://localhost:5100/api/admin`. Responses: `{ success, statusCode, message, data }`.
Auth: `Authorization: Bearer <staff token>` from `POST /auth/login`. Customer tokens are rejected (different secret and audience).
Every write is recorded in the audit log. Roles: **owner** (all), **manager** (all except staff), **frontdesk** (day-to-day), **accountant** (payments, reports, audit, read-only elsewhere). Permissions live in `server/src/lib/permissions.ts`.
Dates `YYYY-MM-DD`, times `HH:00`, Nepal time, money in whole rupees. List endpoints take `page` and `limit` (max 100).

| Area | Method and path | Permission | Notes |
|---|---|---|---|
| Auth | `POST /auth/login` | none | `{email,password}` → `{token, admin{…,permissions}}`. 10 tries / 15 min / IP |
| | `GET /auth/me`, `POST /auth/change-password` | any staff | |
| Staff | `GET /staff`, `POST /staff`, `PATCH /staff/:id` | staff.manage | cannot disable or demote yourself; one active owner always remains |
| Dashboard | `GET /dashboard` | any staff | bookings and revenue today, pending payments, disputes, refunds due, arrivals, new customers |
| Arrivals | `GET /arrivals` | bookings.read | today's live court bookings and Gamezone sessions: `{date, nowMinutes, items[{kind,code,time,endTime,name,phone,amount,paid,method,status,checkedInAt}]}`; `checkedInAt` is set when the customer tapped "I'm coming". The page groups them: on the way, not confirmed, finished |
| Bookings | `GET /bookings?scope=today|upcoming|previous&date&from&to&status&paymentStatus&q` | bookings.read | scope orders the list (upcoming/today oldest first, previous newest first); membership ledger rows are hidden |
| | `GET /bookings/counts` | bookings.read | `{upcoming,today,previous}` for the tab badges |
| | `GET /bookings/calendar?month=YYYY-MM` | bookings.read | `[{date,count}]` live bookings per day, for the calendar dots |
| | `GET /bookings/:id` | bookings.read | id or code; includes payment order and player stats |
| | `POST /bookings/walk-in` | bookings.write | `{date,startTime,duration,customerName,customerPhone?,paymentMethod,paid,priceOverride?,notes?}`; price from Settings; unique (date, hour) guard → 409. Dates within 60 days of today; an hour that has already passed is logged as `completed` (and a paid game by a registered customer earns its points) |
| | `POST /bookings/:id/cancel` | bookings.write | keeps the record, frees the slot, returns a used voucher, paid online order → `refunded` + REFUND_DUE |
| | `POST /bookings/:id/complete` | bookings.write | not for future games; awards price/100 points once (paid, registered, regular games only) |
| | `POST /bookings/:id/no-show` | bookings.write | |
| | `POST /bookings/:id/mark-paid` | payments.write | `{method: venue|esewa|fonepay}`; records how it was really paid (the booking's method is updated) |
| | `PUT /bookings/:id/player-stats` | bookings.write | goals and assists for registered players |
| Payments | `GET /payments/ledger?kind=court|gamezone&status=paid|unpaid|cancelled&mode=cash|online|esewa|fonepay&from&to&q` | payments.read | one row per court booking or Gamezone session with paid / unpaid / cancelled and cash (pay at venue) or online (eSewa, Fonepay); `from`/`to` are game dates; membership ledger rows excluded |
| | `GET /payments/summary` (same filters, without status) | payments.read | paid, unpaid, cancelled counts and sums, split cash / online / eSewa / Fonepay |
| | `GET /payments?status&purpose&method&q` | payments.read | gateway payment orders |
| | `GET /payments/reconciliation` | payments.read | paid orders whose booking is unpaid, expired-but-paid, failed gateway events |
| | `GET /payments/refunds?status=due|paid` | payments.read | |
| | `POST /payments/:orderCode/refund` | payments.write | records a refund you paid out (`REFUND_PAID`) once |
| | `POST /payments/:orderCode/mark-paid` | payments.write | court and Gamezone orders |
| Courts | `GET /courts/pricing`, `PUT /courts/pricing` | bookings.read / courts.write | writes the Settings keys the customer app reads; every price is Rs. 100 to Rs. 100,000 |
| | `GET /courts/slots?date` | bookings.read | every hour 0-23: free, booked (booking summary with name, phone, code, price, status) or blocked; powers the Slots timeline |
| | `GET/POST /courts/blocks`, `DELETE /courts/blocks/:id` | courts.write | a block also takes the (date, hour) slot so customers cannot book it |
| Membership plans | `GET /membership/plans`, `POST /membership/plans`, `PUT /membership/plans/:id` | membership.read / membership.write | price matrix morning, day, evening x 1, 3, 6 months; each cell `{price|null, discount}` (customer pays price - discount); plans are never deleted, retire with `isActive:false`; one featured plan at a time; the old `price` column is kept at the cheapest 1-month price |
| Customers | `GET /customers?q&status`, `GET /customers/:phone` | customers.read | never returns password data |
| | `PATCH /customers/:phone`, `POST /customers/:phone/suspend|unsuspend` | customers.write | |
| Promos | `GET/POST /promos`, `PUT/DELETE /promos/:code`, `GET /promos/usage` | promos.write (usage: reports.read) | stored in Settings `promoCodes`; the customer server re-validates at checkout |
| Loyalty | `GET /loyalty/customers/:phone` | loyalty.read | |
| | `POST /loyalty/goods-sale` | loyalty.write | Rs. 100 = 1 point, once per sale |
| | `POST /loyalty/adjust` | loyalty.adjust | manager/owner, reason required |
| | `POST /loyalty/vouchers/:id/void` | loyalty.adjust | unused vouchers only |
| Teams | `GET /teams`, `GET /teams/disputes`, `GET /teams/settlements?date` | teams.read | |
| | `POST /teams/results/:id/resolve` | teams.write | `{action: approve|void, scoreSubmitter?, scoreOther?, note?}`; approval gives the winning captain 5 points once |
| | `POST /teams/challenges/:id/venue-paid` | teams.write | marks the game paid and sends "Did you win?" to both captains |
| Gamezone | `GET /gamezone/bookings`, `POST /gamezone/bookings/:code/mark-paid|complete|cancel` | gamezone.read / write | cancelling frees the console hour; paid → refund due |
| | `GET /gamezone/catalog`, `POST/PATCH /gamezone/consoles|games`, `PUT /gamezone/plans/:players` | gamezone.write | plans for 1, 2 or 4 players |
| Notices | `POST /notifications/broadcast` | notifications.write | `{type: promo|tournament|general, title, message, href?, audience}`; promo respects opt-outs; inactive customers skipped |
| Reports | `GET /reports/revenue`, `/reports/occupancy`, `/reports/loyalty-liability` | reports.read | revenue and occupancy: max 93 days |
| Audit | `GET /audit?entity&action&staffId&entityId` | audit.read | |

## Not built yet (still served by the customer backend)
Membership subscriptions (requests, verifying payment, renewals), tournaments and tie-sheets, ads, gallery, site info, inventory and goods stock, expenses, SMS, venue settings and Wi-Fi. They are marked "To build" in the web dashboard.

## Known limits
- Notices written here appear in the customer's bell, but closed-app Web Push is sent by the customer server only; broadcasts made here do not push until the two servers are connected (or this server gets the VAPID keys).
- Loyalty adjustments use existing ledger kinds (`game` for additions, `free_game` for removals) so the customer app's points summary keeps working.
- The customer app is the source of truth for how many points are spendable; `approxBalance` here is indicative.

## 6-month memberships need a customer-app change
`sql/002_membership_6_months.sql` adds six nullable columns to the customer table `MembershipPlan` (`price6Months{Morning,Day,Evening}`, `discount6Months{Morning,Day,Evening}`). The customer backend ignores them today (it only offers `1_month` and `3_months`). Before 6 months can be sold the customer repo must add the same columns to its Prisma schema, accept `6_months` in `POST /membership/request`, compute the end date, and award the 6-month points (`half`: 70). Until then 6-month prices are stored but not shown to customers.
