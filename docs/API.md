# Admin API

Base URL `http://localhost:5100/api/admin`. Responses: `{ success, statusCode, message, data }`.
Auth: `Authorization: Bearer <staff token>` from `POST /auth/login`. Customer tokens are rejected (different secret and audience).
Every write is recorded in the audit log. Accounts: the **owner** can do everything, including adding accounts and choosing what staff may do (always owner-only). An **admin** can do everything except manage accounts. A **staff** account can do only the small permissions the owner ticked, one per action (about 43, grouped like the pages). Permissions live in `server/src/lib/permissions.ts`; they are re-read on every request, so a change applies to the person's very next click.
Dates `YYYY-MM-DD`, times `HH:00`, Nepal time, money in whole rupees. List endpoints take `page` and `limit` (max 100).

| Area | Method and path | Permission | Notes |
|---|---|---|---|
| Auth | `POST /auth/login` | none | `{email,password}` → `{token, admin{…,permissions}}`. 10 tries / 15 min / IP |
| | `GET /auth/me`, `POST /auth/change-password` | any staff | |
| Staff | see **Staff & Roles** below | staff.manage | owner only. Includes `PATCH /staff/:id` (name, login email, password, type, permissions, active) and `DELETE /staff/:id` (deleted at once, audit kept; not yourself). A password change or a new login email (by the owner via `PATCH /staff/:id`, or `POST /auth/change-password`) signs that account out on every device; the self-change answers with a fresh `token` for the device in use |
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
| | `POST /bookings/:id/mark-paid` | payments.write | `{method: venue|fonepay, fonepayQrId?}`; records how it was really paid. Fonepay needs `fonepayQrId`: a QR the gateway marked paid, for exactly the booking total (eSewa was removed) |
| | `PUT /bookings/:id/player-stats` | bookings.write | goals and assists for registered players |
| Payments | `GET /payments/ledger?kind=court|gamezone&status=paid|unpaid|cancelled&mode=cash|online|fonepay&from&to&q` | payments.read | one row per court booking or Gamezone session with paid / unpaid / cancelled and cash (pay at venue) or online (eSewa, Fonepay); `from`/`to` are game dates; membership ledger rows excluded |
| | `GET /payments/summary` (same filters, without status) | payments.read | paid, unpaid, cancelled counts and sums, split cash / online / Fonepay (older eSewa payments still count as online) |
| | `GET /payments?status&purpose&method&q` | payments.read | gateway payment orders |
| | `GET /payments/reconciliation` | payments.read | paid orders whose booking is unpaid, expired-but-paid, failed gateway events |
| | `GET /payments/refunds?status=due|paid` | payments.read | |
| | `POST /payments/:orderCode/refund` | payments.write | records a refund you paid out (`REFUND_PAID`) once |
| | `POST /payments/:orderCode/mark-paid` | payments.write | court and Gamezone orders |
| Courts | `GET /courts/pricing`, `PUT /courts/pricing` | bookings.read / courts.write | writes the Settings keys the customer app reads; every price is Rs. 100 to Rs. 100,000 |
| | `GET /courts/slots?date` | bookings.read | every hour 0-23: free, booked (booking summary with name, phone, code, price, status) or blocked; powers the Slots timeline |
| | `GET/POST /courts/blocks`, `DELETE /courts/blocks/:id` | courts.write | a block also takes the (date, hour) slot so customers cannot book it |
| Inventory report | `GET /inventory/report?from&to` (Nepal dates, at most 93 days) | inventory.view | Fonepay and cash totals plus detail: games (team, rate, promo), customer purchases (items, payment), Gamezone sessions (customer, bill, extra hours beyond the first), memberships made or paid in the period, items sold. Each rupee once: games from Booking cash/online by game date, goods from the sale logs by sale time plus credit goods when paid (`GoodsDue.cashAmount/onlineAmount`, `sql/014`), Gamezone when paid; bills are never added again, unpaid games and credit goods are not money yet, memberships are not in the totals |
| Audit log | `GET /audit?entity&action&staffId&entityId&from&to&q&page&limit`, `GET /audit/filters` | audit.view | Every staff write leaves a row (who, action, record, details, IP). `from`/`to` are Nepal dates, `q` searches staff name, record id, action, entity and the details text. `/audit/filters` returns staff, entities and actions with counts plus today / 7-day / total counts. Rows cannot be edited or deleted through the API. |
| Settings | `GET /settings`, `PUT /settings/venue`, `PUT /settings/wifi`, `PUT /settings/booking` | settings.view / settings.edit | Writes the Settings keys the customer backend already reads (`siteInfo` for the footer, Help page and Call / WhatsApp buttons, `wifiSSID`, `wifiPassword`, `advanceDeposit`), so the customer app needs no change. `GET` also reports Fonepay mode and whether its keys are set, whether push keys exist, database and environment, never a secret. Viewers see the Wi-Fi password as "(set)". Audited; the Wi-Fi password is never written to the log. Own password: `POST /auth/change-password`. |
| Teams & Challenges | `GET /teams?q`, `GET /teams/overview`, `GET /teams/:id`, `GET /teams/challenges?status&q&page`, `GET /teams/disputes`, `POST /teams/results/:id/resolve`, `GET /teams/settlements?date`, `POST /teams/challenges/:id/venue-paid` | teams.view / teams.resolve / teams.venuepaid | Record and form come from APPROVED results only (awaiting and disputed ones change nothing). The captain always counts in the roster. A team is "open" when a challenge waits for an answer or an accepted game is not played yet. Resolve and venue-paid rules are unchanged: approve awards the winning captain 5 points once, venue-paid marks the court booking paid and asks both captains "Did you win?". |
| Reports summary | `GET /reports/summary?from&to` (Nepal dates, up to 93 days, default the last 30) | reports.view | One call for the Reports page: sales by day (cash and Fonepay; games, goods and Gamezone counted once, same rules as the Inventory report) with the same-length period before for comparison, games (paid, unpaid, average rate, cancelled, no-shows, booked in the app / by staff / challenge), booked hours with busiest hours and weekdays, promo code use, best customers, memberships and loyalty standing (not tied to the period). No-shows are not counted as games or hours. The older `/reports/revenue`, `/reports/occupancy`, `/reports/loyalty-liability` still exist. |
| Activity feed (the bell) | `GET /activity?since=ISO` | dashboard.view (each kind needs its own view permission) | What customers just did, newest first (up to 40, default the last 24 hours, at most 7 days): new bookings (not staff walk-ins or membership ledger rows), cancellations, online payments, new sign-ups, complaints, referrals, academy sign-ups, challenges and scores, Gamezone bookings, membership requests, "I am coming". It reads the tables the customer app writes, so nothing is synced. The admin bell polls it every 15 seconds. Staff actions reach customers through `Notification` rows (cancel, payment received, complaint replies, referral and membership decisions, Gamezone cancel / paid / done, notices). |
| Loyalty points page | `GET /loyalty/overview?from&to`, `GET /loyalty/customers?q&sort=balance|expiring|name&page`, `GET /loyalty/ledger?kind&from&to&q&page`, `GET /loyalty/vouchers?status&page`, plus `GET /loyalty/customers/:phone`, `POST /loyalty/adjust`, `POST /loyalty/vouchers/:id/void` | loyalty.view / .adjust / .void | A customer's balance is valid earned points (not expired) plus spent (negative) ones: a close estimate, the customer app decides what is spendable on a day. Owed points sum the positive balances. Expiring soon = positive points ending within 30 days. Adjust is +/- up to 200 with a reason of 5+ letters and tells the customer. |
| Promo codes | `GET /promos`, `POST /promos`, `PUT /promos/:code`, `PATCH /promos/:code/active`, `DELETE /promos/:code` | promos.view / .create / .edit / .delete | Stored in Settings `promoCodes`, which the customer app reads and validates again at payment. The list adds `status` (active, paused, expired by last day), `uses`, `discountGiven` and `lastUsedAt` from bookings and memberships that were not cancelled. Days of the week are stored as FULL names ("Saturday"), the way the customer app compares them; short names are accepted and converted. A code cannot be created already expired, with half a time window or a backwards one, or with the name of a VIP code. |
| Membership subscriptions | `GET /membership/subscriptions?status=pending|active|expiring|expired|suspended|cancelled&q&page`, `GET /membership/subscriptions/:id`, `POST /membership/subscriptions` (`dryRun` checks only), `POST /membership/subscriptions/:id/verify`, `/renew`, `/extend`, `/suspend`, `/resume`, `/cancel`, `PATCH /membership/subscriptions/:id` (note) | membership.view / .create / .edit | FRD-001 sections 25 to 27. Each membership has a Membership ID `MEM-10001...` (column `memberCode`, `sql/013_member_code.sql`). Status is worked out from the dates: active, expiring (15 days or less left), expired, plus pending, suspended, cancelled. A membership is one hour (never 4 PM to 8 PM) on chosen weekdays from the start date for 30 / 90 / 180 days; the price comes from the plan matrix for the hour shift (before 12 morning, 12 to 4 day, 8 PM on evening). The hour is HELD for the member: `POST /bookings/walk-in` and `/walk-in/bulk` refuse it (409), `GET /courts/slots` returns `member` on the hour, and another membership cannot take it. Paying (at creation, `verify` or `renew`) takes cash and/or a paid Fonepay QR (`payments`, `single`, `fonepayQrId`, same rules as bills), writes a `MEMBERSHIP_PAYMENT` ledger row, awards points once (3 months 30, 6 months 70) and notifies the member (`membership` notices: active, renewed, extended, suspended, resumed, cancelled; expiring and expired are sent once by a sweep that runs whenever the list is opened). Renew continues after the end date (or starts today when it ended). Resuming or extending is refused where the hour has been taken meanwhile. Registered customers only. |
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
| Gamezone | `GET /gamezone/bookings?scope=today|upcoming|previous&unpaid=1&q&page`, `GET /gamezone/day?date=` , `POST /gamezone/bookings/:code/mark-paid|complete|cancel` | gamezone.view / collect / manage | list items carry `consoleName`, `customerName`, `customerPhone`, `registered`, `checkedInAt`. `/day` returns every console, that day's sessions and `totals {sessions, hours, paid, owed, cancelled}` (cancelled not counted). Cancelling frees the console hour; paid → refund due |
| | `GET /gamezone/catalog`, `POST/PATCH /gamezone/consoles|games`, `PUT /gamezone/plans/:players` | gamezone.write | plans for 1, 2 or 4 players |
| Notices | `POST /notifications/broadcast` | notifications.write | `{type: promo|tournament|general, title, message, href?, audience: all|captains|customer, phone? (customer only)}`; promo respects opt-outs; inactive customers skipped; also sent as Web Push to each customer's saved devices (needs the customer backend's VAPID keys in this server's `.env`), response has `pushed` |
| Notices | `GET /notifications/reach?type&audience&phone` | notifications.write | `{reach, skippedOptOut}` before sending |
| Notices | `GET /notifications/history` | notifications.write | last 30 broadcasts: `{type,title,message,audience,phone,sent,read,by,at}` |
| Tournaments | `GET /tournaments`, `GET /tournaments/:id` | tournaments.view | list with registrations, matches and live counts; one tournament with rounds, matches and goals (and the host link if you may share) |
| | `PUT /tournaments/:id/tiesheet` | tournaments.edit | `{rounds:[{id?,name,matches:[{id?,home,away,startsAt,venue,note}]}]}` saved IN PLACE: a match with its id keeps its score, goals and followers; left out = removed. Live state is never overwritten by saving the sheet |
| | `POST /tournaments/matches/:id/goal`, `DELETE /tournaments/goals/:id` | tournaments.edit | `{side: home|away, minute?, scorer?}`; the score follows the goals; a match that has not started goes live; finished matches must be reopened (409). Followers get "Goal!" (bell + Web Push); taking a goal back tells nobody |
| | `POST /tournaments/matches/:id/status` | tournaments.edit | `{status: upcoming|live|finished, homeScore?, awayScore?, note?}`: kick-off, full time, reopen, score correction; both teams must be set |
| | `POST`, `DELETE /tournaments/:id/host-link` | tournaments.share | create or renew (the old link stops at once) or switch off the private host link; it expires 3 days after the tournament ends |
| Host link | `GET /host/:token`, `PUT /host/:token/tiesheet`, `POST /host/:token/matches/:id/goal`, `DELETE /host/:token/goals/:id`, `POST /host/:token/matches/:id/status` | none (the secret token) | the same actions for ONE tournament, for a match-day host without a staff account. 404 unknown or switched off, 410 expired, rate limited. Shows no registrations, phone numbers or money. Audited as "Host link". Tables `MatchGoal`, `TournamentHostLink` (sql/018) |
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

## Complaints (staff side)
| Method and path | Permission | Notes |
|---|---|---|
| `GET /complaints?status=open|in_review|resolved|closed&category=&q=&page=&limit=` | complaints.read | newest first; `q` matches code, words in the message, phone or the customer's name; each item has `customerName`, `customerPhone`, `photos` |
| `GET /complaints/counts` | complaints.read | `{all, open, in_review, resolved, closed}` for the tab badges |
| `GET /complaints/:id` | complaints.read | id or code; adds `customerComplaints` (how many this customer has sent) |
| `PATCH /complaints/:id` | complaints.write | `{status?, reply? (max 1000)}`; sets `resolvedAt` when resolved or closed, clears it on reopen; creates a `complaint` notification for the customer only when something changed; audited |

Front desk, manager and owner can read and answer complaints; accountants cannot. The table `Complaint` belongs to the customer backend (migration `20261007000001_complaints`); `sql/003_complaints_mirror.sql` only creates it (IF NOT EXISTS) in a local admin database. Photos are `/uploads/complaints/...` paths served by the customer backend (the admin web reads them from `NEXT_PUBLIC_CUSTOMER_ORIGIN`) or full cloud URLs. The in-app notice is written to the shared notification table; closed-app Web Push for it is sent by the customer server only.

## Children's Academy (staff side)

Ages 10 to 14. Staff publish class times; the customer app (`/academy` on the customer backend) shows only classes that are visible, open and not started, and enrols a guardian's child. Same tables (`AcademySession`, `AcademyEnrollment`; local mirror `sql/007_academy_mirror.sql`); the Terms live in `Settings` key `academyTerms`.

| Route | Permission | Notes |
|---|---|---|
| `GET /academy/overview` | academy.view | upcoming classes, shown to guardians, enrolled children, children with health notes |
| `GET /academy/sessions?scope=upcoming\|past` | academy.view | each class with `enrolled`, `seatsLeft`, `visible`, `started` |
| `POST /academy/sessions` | academy.sessions | `{date, startTime, endTime, title?, coach?, capacity (1-100), visible, repeatWeeks (0-12)}`; future only; same start time twice is refused |
| `PATCH /academy/sessions/:id` | academy.sessions | title, coach, capacity (not below enrolled), `visible` (show or hide from guardians); date and time only while nobody is enrolled |
| `POST /academy/sessions/:id/cancel` | academy.sessions | `{reason?}`; cancels the enrolments and notifies each guardian (`type: "academy"`) |
| `GET /academy/enrollments?sessionId&status&health=condition&q&page` | academy.view | child, guardian, emergency contact, address, health notes |
| `POST /academy/enrollments/:id/attendance` | academy.enrollments | `{status: attended\|no_show\|confirmed}`; only after the class started |
| `POST /academy/enrollments/:id/cancel` | academy.enrollments | notifies the guardian |
| `GET /academy/terms` | academy.view | current text, version and earlier versions |
| `PUT /academy/terms` | academy.terms | `{text}`; every change raises the version, guardians must accept the newest |

## Refer & Earn (staff side)

A customer books a game for another team and files it in the app (customer backend `/refer`). Staff check it here; approving writes loyalty points (kind `referral`, valid 12 months) for BOTH people. Same table `Referral` (local mirror `sql/008_refer_mirror.sql`); rules in `Settings` key `referEarn`.

| Route | Permission | Notes |
|---|---|---|
| `GET /refer/overview` | refer.view | pending, approved, rejected, points given, rules |
| `GET /refer?status&q&page&limit` | refer.view | search by name, phone, team, booking or referral code; each item has both people and the booking state |
| `GET /refer/counts` | refer.view | counts per status |
| `PATCH /refer/:id` | refer.review | `{referrerPoints?, friendPoints?}` (0 to 200) while pending |
| `POST /refer/:id/approve` | refer.review | optional points override; refused (409) if the booking was cancelled; claims it first so points are never given twice; notifies both |
| `POST /refer/:id/reject` | refer.review | `{reason}` (3+ chars), notifies the customer |
| `POST /refer/:id/adjust` | refer.adjust | `{referrerPoints, friendPoints, reason}` totals for an approved referral; the difference is added or taken from each person |
| `GET /refer/settings`, `PUT /refer/settings` | refer.view, refer.settings | `{enabled, referrerPoints, friendPoints}` |

## Site Content: gallery and ads (staff side)

Pictures and ads shown in the customer app (customer backend `GET /content/active`, `/content/media/:id`). Pictures are decoded, stripped of location data, shrunk to 1600px JPEG and stored in the database (`ContentMedia`); tables `SiteGallery`, `SiteAd` (local mirror `sql/009_site_content_mirror.sql`). This router accepts bodies up to 14 MB (after the staff sign-in check); the rest of the API stays at 100 KB.

| Route | Permission | Notes |
|---|---|---|
| `GET /content/overview` | content.view | photos, live ads (by place), views, clicks |
| `GET /content/gallery` | content.view | all photos, in display order |
| `POST /content/gallery` | content.gallery | `{title, caption?, image: data URL}`; JPG, PNG or WebP up to 8 MB; orientation detected; max 100 |
| `PATCH /content/gallery/:id` | content.gallery | title, caption, `visible` |
| `POST /content/gallery/reorder` | content.gallery | `{ids: [all ids in order]}` |
| `DELETE /content/gallery/:id` | content.gallery | also removes the picture |
| `GET /content/ads` | content.view | each ad has `status`: live, waiting (inside its dates but not in today's hours or weekday), scheduled, ended, paused; views, clicks |
| `POST /content/ads` | content.ads | `{title, image, placement: header\|footer\|inline\|popup, linkUrl? (/path or https://), displaySeconds (3-60; popup 0-60, 0 = stays), popupDelaySeconds, popupFrequency: session\|day\|always, startDate?, endDate?, dailyStart?+dailyEnd? (HH:mm, Nepal time, may pass midnight), days[] (0 = Sunday), priority, active}`; max 100 |
| `PATCH /content/ads/:id` | content.ads | any field; `image` replaces the picture (the old one is deleted) |
| `DELETE /content/ads/:id` | content.ads | also removes the picture |

## Inventory & Goods

Uses the venue's existing `Product`, `Category` and `InventoryLog` tables (the customer backend already takes bottled water from stock when a booking is paid) and `GoodsSale`. No new tables. Every stock change is one `InventoryLog` row, written together with the new stock under a row lock, so stock can never go below zero and two staff cannot sell the last item twice.

| Route | Permission | Notes |
|---|---|---|
| `GET /inventory/overview` | inventory.view | products, low, out of stock, stock value (cost), sales today and last 7 days |
| `GET /inventory/categories`, `POST`, `PATCH /:id`, `DELETE /:id` | view; products | names are unique (any case); a category with products cannot be deleted |
| `GET /inventory/products?q&category&stock=low\|out` | inventory.view | `state` ok, low (at or below the warning level) or out; margin from cost price |
| `POST /inventory/products` | inventory.products | `{name, categoryId, price, costPrice?, unit, lowStockThreshold, openingStock}`; opening stock is logged |
| `PATCH /inventory/products/:id`, `DELETE` | inventory.products | stock is not editable here; a product in past orders cannot be deleted |
| `POST /inventory/products/:id/stock` | inventory.stock | `{type: add\|remove\|set, quantity, reason?, costPrice?}`; set = the counted amount; refuses to go below 0 |
| `GET /inventory/logs?page` | inventory.view | newest first |
| `POST /inventory/sales` | inventory.sell | `{payment: cash\|online, phone?, items[{productId, quantity}]}`; price from the product, never the request; all-or-nothing; a registered phone earns Rs. 100 = 1 point (once); walk-ins earn none |
| `GET /inventory/sales?page` | inventory.view | who bought, what, who sold |

### Final bill (goods and games together)

Staff enter a registered customer's number in Sell goods. The bill lists their games from the last 7 days (unpaid ones ticked) and the goods. It is saved in the customer's own table `Checkout` (customer migration `20261013000001_checkouts`, local mirror `sql/010_checkout_mirror.sql`) and appears in the customer's payment history in the app (`GET /me/payments`, `kind: "bill"`).

| Route | Permission | Notes |
|---|---|---|
| `GET /inventory/customer-bill?phone=` | inventory.sell | `{customer, games[{id, code, date, startTime, endTime, total, paid, status, upcoming, pointsIfCompleted}]}`: the last 7 days up to today, cancelled and pending-hold bookings left out |
| `POST /inventory/checkout` | inventory.sell (+ payments.collect when games are included) | `{phone, payment: cash or online, items[], bookingIds[]}`: marks each game paid (only once; 409 if already paid), takes the stock, writes one bill `CB-XXXXXX`, all in one transaction. Points: goods Rs. 100 = 1 now; a game already played is completed and earns price / 100 now; a game still to be played earns its points when completed. The customer is notified |
| `GET /inventory/bills?page` | inventory.view | bills newest first with lines and points |

## Dues (what one customer still owes)

`GET /bookings/:id/dues` (bookings.view): for an unpaid booking, the same customer's other unpaid bookings (matched by account or by phone number; no phone number means nothing else can be found). `past` = before today, `today`, `upcoming` = after today, plus `pastTotal`. Cancelled, expired, rejected, paid, and online bookings still waiting for their QR are left out.

`POST /bookings/collect-dues` (payments.collect): `{anchorId, bookingIds[], goodsDueIds[], method: venue|fonepay or payments[], fonepayQrId?}`. Collects those bookings in one payment (all must belong to the same customer, each only once: 409 if already paid). A registered customer gets one bill `CB-XXXXXX` in their payment history; games already played earn their points, upcoming ones earn them when completed.

## Split payment and goods on credit (inventory dues)

All counter collections go through one shared module (`server/src/lib/settle.ts`).

- **Split payment:** `checkout`, `collect-dues` and `POST /inventory/sales` accept `payments: [{method: cash|fonepay, amount}]` (whole rupees). The amounts must add up exactly to the total (400 otherwise, nothing changes). Each line records how much of it was cash and how much online (booking `cashAmount`/`onlineAmount`, stock log). A bill paid with several methods is stored with `paymentMethod: "split"`. A single `payment`/`method` still pays the whole total.
- **Goods on credit:** `POST /inventory/checkout` with `payment: "due"` and only `items`: the stock leaves now, a `GoodsDue` row (admin-owned table, `sql/011_goods_dues.sql`) is put on the customer's account (registered customers only), no bill and no points yet, and it is not counted in sales. It needs only `inventory.sell`.
- **Collecting dues:** `GET /bookings/:id/dues` also returns `goods[]` and `goodsTotal`; `POST /bookings/collect-dues` and `POST /inventory/checkout` accept `goodsDueIds[]` next to `bookingIds[]` (needs `payments.collect`). Paying a goods due makes the bill line, earns the goods points (Rs. 100 = 1) and cannot be done twice (409). `GET /inventory/customer-bill` also lists `goodsDues`; `GET /inventory/overview` has `goodsDue {amount, count}`; `GET /inventory/sales` marks each sale `credit: due|paid|null`.

## Fonepay dynamic QR (eSewa is removed: cash and Fonepay only)

Money collected at the counter is **cash** and/or **Fonepay**. The Fonepay part is always backed by a dynamic QR the server makes for the exact amount. Example: a bill of Rs. 1000, staff enter Rs. 500 cash, the screen works out Rs. 500 for Fonepay and shows a Rs. 500 QR; when the gateway reports it paid, the bill can be saved.

| Route | Who | Notes |
|---|---|---|
| `POST /fonepay/qr` | payments.collect, inventory.sell or bookings.create | `{amount (whole rupees, 1 to 1,000,000), remarks?, purpose?, customerPhone?}` -> `{id, prn, amount, status: pending, expiresAt (10 minutes), qrPayload, qrImage (PNG data URL), mode: test or live}` |
| `GET /fonepay/qr/:id` | same | status `pending, paid, failed, expired`; the screen polls it every 3 seconds; asks the gateway on each call |
| `POST /fonepay/qr/:id/cancel` | same | not allowed once paid |
| `POST /fonepay/qr/:id/simulate-paid` | same | **TEST mode only** (404 in live mode): plays the gateway |
| `POST /fonepay/webhook` | gateway (public) | the gateway's callback; trusted only after the provider verifies its signature; idempotent; amount must match. Returns 501 until the live provider is filled in |

How a QR backs a bill: `checkout`, `collect-dues`, `POST /inventory/sales` and `mark-paid` take `fonepayQrId`. The server checks that the QR is **paid**, **not used before**, and **exactly the Fonepay part** (409 otherwise), and marks it used for that bill. Staff cannot say "it was paid": only the gateway can. A walk-in or bulk booking cannot be created already "paid by Fonepay" (400): book it unpaid, then collect with the QR.

**Going live with the real Fonepay API** (everything else stays the same):
1. Fill in `LiveFonepayProvider` in `server/src/lib/fonepay.ts`: `createQr` (call Fonepay, return the QR text), `checkStatus` (Fonepay status API), `verifyCallback` (check the gateway signature, return `{prn, paidAmount, reference}`).
2. Set in `.env`: `FONEPAY_MODE=live`, `FONEPAY_MERCHANT_CODE`, `FONEPAY_SECRET`, `FONEPAY_BASE_URL` (and `FONEPAY_QR_TTL_MINUTES` if needed). `FONEPAY_MODE=test` is refused when `NODE_ENV=production`.
3. Give Fonepay the callback address `https://<admin server>/api/admin/fonepay/webhook`.
Table `FonepayQr` (admin-owned, `sql/012_fonepay_qr.sql`) keeps every QR with its PRN, amount, status, who made it and which bill used it.

## Bulk booking

`POST /bookings/walk-in/bulk` (bookings.create): `{dates[1-31], startTime, duration 1-4, customerName, customerPhone?, paymentMethod, paid, priceOverride? (per game), notes?, mode: free or all, dryRun}`. The same hour(s) on every date. `dryRun: true` returns each date as free or taken (a blocked hour counts as taken) with the price and the total, and changes nothing. `mode: "free"` books the free dates and skips the taken ones; `"all"` books everything or nothing (409 listing the taken dates). Dates must be within 60 days of today. Each booking has its own code; the notes carry `BULK <first code>` so a batch can be found. One audit entry for the batch.

## Customers page
| Method and path | Permission | Notes |
|---|---|---|
| `GET /customers?q&mode=captain|player&status=active|suspended&page&limit` | customers.read | each item has `mode` and `stats {gamesPlayed, gamezoneSessions, paidTotal, unpaidTotal, openComplaints, cancelStreak}` (court bookings by account; paid excludes cancelled; unpaid = not yet paid and not cancelled) |
| `GET /customers/:phone/profile` | customers.read | one call with: `games`, `payments` (cash / online / unpaid, recent court + Gamezone), `goods` (extra items sold at the venue), `complaints`, `tournaments.entered` and `tournaments.challengesHosted`, `profile` (captain or regular, position, team, challenge record W/D/L), `cancellations`, `vip` |
| `POST /customers/:phone/suspend` and `/unsuspend` | customers.write | records are kept; the customer cannot sign in while suspended |
| `PUT /customers/:phone/vip` | customers.write | `{code, type: percent|flat, value, active?, note?}`. One VIP code per customer. The code (3 to 20 letters or numbers, stored in capitals) cannot equal a normal promo code (409). Changing the code clears `claimedAt`, so the customer must type the new one. Audited (`vip-give`, `vip-update`) |
| `DELETE /customers/:phone/vip` | customers.write | removes it; the customer pays the normal price again. Audited (`vip-remove`) |

**Cancellations in a row.** `cancelStreak` is how many of the customer's newest bookings (court and Gamezone together) were cancelled, counted until the first one that was not. Left out: cancellations staff made (an audit-log "cancel" by a staff member) and unpaid QR holds that expired, so the customer is never blamed for what the venue did. The profile's `cancellations` has `streak`, `total`, `last30`, `lateCount` (cancelled less than 2 hours before the game) and the 10 most recent with how many hours before the game and whether it had been paid. The Customers list shows "Cancelled N games in a row" from 2 upwards with a one-tap **Suspend now**.

**VIP code.** Staff give a customer a code such as `ADMINVIP` worth a percent or rupees off. The customer types it once in the promo box when booking; the customer backend then marks it claimed and applies it automatically to every later booking (bigger of VIP and any normal promo code wins). The profile's `vip` shows whether the customer has entered it yet, and `usage` (games discounted and discount given, from bookings whose `promoCode` is the VIP code, cancelled ones excluded). The table `VipCode` belongs to the customer backend (migration `20261009000001_vip_codes`); `sql/005_vip_codes_mirror.sql` only creates it (IF NOT EXISTS) in a local admin database.

"Tournaments hosted": tournaments are created by the venue; the customer app has no customer-run tournaments. The profile shows tournaments the customer entered (as team contact) and challenge matches their team hosted.

## VIP Privilege page
| Method and path | Permission | Notes |
|---|---|---|
| `GET /vip?status=active|paused|unclaimed&q&page&limit` | customers.read | every VIP customer: `code`, `type`, `value`, `active`, `note`, `claimedAt` (when the customer first typed it), `usage {games, discountGiven}`, `customerName`, `accountActive`; plus `totals {customers, active, paused, entered, games, discountGiven}` over all VIPs. `q` matches name, phone, code or note |
| `GET /vip/generate-code` | customers.read | a fresh code like `VIPK7M3Q` (no 0/O/1/I) that no customer has and no normal promo code uses |
| `POST /vip` | customers.write | `{phone, code?, type: percent|flat, value, note?}`; leave `code` out to have one made. 404 unknown customer, 409 if the customer already has a VIP code or the code equals a normal promo code. Audited (`vip-give`) |

Change, pause and remove use `PUT` and `DELETE /customers/:phone/vip`, called only from the VIP Privilege page. The Customers page is read-only for VIP: it highlights VIP customers (`vip: {code, active}` on each list item) with a gold "VIP" tag and shows the code in the customer sheet.

## Staff & Roles (owner only)
Only the owner can use these endpoints (`staff.manage` is never given to admins or staff).

| Method and path | Notes |
|---|---|
| `GET /staff` | every account: `accountType` (admin or staff), `permissions` (what was ticked), `effective` (what the account can really do), `legacyRole` (an older fixed role: manager, frontdesk or accountant) |
| `GET /staff/catalog` | `sections` (15, one per page, each with its tick boxes `{key, label}`), `presets` (Front desk, Accountant, Gamezone attendant, Manager, View only) and `assignable` (all 43 keys) |
| `POST /staff` | `{email, name, accountType: admin|staff, password (10+), permissions?}`; permissions are ignored for admins; unknown keys, owner-only keys and the older coarse names are refused (400) |
| `PATCH /staff/:id` | `{name?, accountType?, permissions?, isActive?, password?}`. Turning an older role into staff keeps what it could do. Admins cannot be given a list (change them to Staff first) |

### The small permissions
One per action. Dashboard: `dashboard.view`. Bookings: `bookings.view`, `.create`, `.cancel`, `.complete`, `.noshow`, `.stats`. Slots and arrivals: `slots.view`, `arrivals.view`. Payments: `payments.view`, `.collect` (also marks a booking or order paid), `.refund`. Courts: `courts.view`, `.price`, `.block`. Promo codes: `promos.view`, `.create`, `.edit`, `.delete`. Customers: `customers.view`, `.edit`, `.suspend`. VIP: `vip.view`, `vip.manage`. Loyalty: `loyalty.view`, `.goods`, `.adjust`, `.void`. Membership: `membership.view`, `.create`, `.edit`. Teams: `teams.view`, `.resolve`, `.venuepaid`. Gamezone: `gamezone.view`, `.collect`, `.manage` (complete or cancel a session), `.catalog` (rates, consoles, games). Complaints: `complaints.view`, `.reply`. Inventory & Goods: `inventory.view`, `.products`, `.stock`, `.sell`. Site Content: `content.view`, `.gallery`, `.ads`. Refer & Earn: `refer.view`, `.review`, `.adjust`, `.settings`. Children's Academy: `academy.view`, `.sessions`, `.enrollments`, `.terms`. Notices: `notifications.send`. Reports and audit: `reports.view`, `audit.view`.

Older accounts keep working: the older roles and the older coarse names (`bookings.read`, `payments.write`, ...) are expanded into the small permissions when read.

Safety rules: only the owner can change the owner account; you cannot demote or disable yourself; one active owner must always remain. Every change is audited with the new access list, never with passwords.

### In the portal
Everyone sees every page, like an admin. What a person may do is checked when they click: buttons and forms are there, and an action the account may not do (or a page of data it may not view) shows the message "This feature is only accessible to the Owner. Please contact him." The server refuses the request either way (HTTP 403).

## Digital ID (QR scan, staff)

The customer's QR holds only `UFID1.` + a random 192-bit token (customer app `GET /me/digital-id`), no personal data. Only staff can resolve it.

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/admin/digital-id/resolve` | `digitalid.scan` | `{code}` (the QR text) -> `{phone, name}`. 422 not a Unique Futsal ID / bad format, 404 unknown or replaced. Audited (`digitalid-scan`) |
| GET | `/admin/digital-id/search?q=` | `digitalid.scan` | fallback: name or number, 2+ characters, 10 results |
| GET | `/admin/digital-id/:phone` | `digitalid.scan` | `{profile, extras}`: the full customer profile (same as `/customers/:phone/profile`) plus upcoming bookings with paid flag, add-ons, Gamezone, loyalty points and vouchers, referrals, membership with attendance, and `spent` (games + goods) |
| GET | `/admin/digital-id/:phone/card` | `digitalid.scan` | `{name, phone, payload, whatsapp}` for the card picture; makes the customer's Digital ID if they never opened theirs |
| POST | `/admin/digital-id/:phone/attendance` | `digitalid.attendance` | marks today's attendance on the active membership, once per day (409 no active membership) |

Tables: `DigitalId` (shared, customer migration `20261015000001_digital_id`; here `sql/015_digital_id.sql`), `MembershipAttendance` (admin-owned).
