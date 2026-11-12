// Single source for the sidebar, the dashboard cards and the placeholder module pages.
// To build a real page later: create app/(dashboard)/<slug>/page.tsx. A real folder wins over the generic [section] page.

export type EndpointStatus = "ready" | "needed"; // ready = already in the customer backend, needed = must be added

export type Endpoint = { method: string; path: string; note: string; status: EndpointStatus };

export type Module = {
  slug: string;
  title: string;
  group: string;
  icon: string; // key in components/icons.ts
  summary: string;
  clientFeatures: string[]; // what the customer app offers, so admin knows what to manage
  adminTasks: string[]; // what staff will do here
  endpoints: Endpoint[];
};

const e = (method: string, path: string, note: string, status: EndpointStatus = "ready"): Endpoint => ({ method, path, note, status });

export const modules: Module[] = [
  {
    slug: "slots", title: "Slots", group: "Operations", icon: "clock",
    summary: "Day timeline of every hour: who is playing, open hours, and manual booking.",
    clientFeatures: ["Free hours listed per date", "Pay at venue or online", "Guest vs registered customers", "Free cancellation until start", "Full-screen \"I'm coming\" slider and pop-up reminder setting (check-in window: 1h before to 30 min after)"],
    adminTasks: ["See a whole day at once (booked, completed, open, blocked)", "See on each of today's games whether the customer is Coming (tapped I'm coming) or Arrival not confirmed", "Tap + to book a customer by hand (walk-in or phone)", "Bulk booking: the same hour on many dates (chosen weekdays such as Tue, Thu, Sun for N weeks, every day, or picked dates), checked before it is booked", "Log a game that already happened", "Reject (cancel) a booking"],
    endpoints: [
      e("GET", "/admin/courts/slots", "all hours of a date with who booked them and when they confirmed I'm coming"), e("POST", "/admin/bookings/walk-in", "manual booking"), e("POST", "/admin/bookings/walk-in/bulk", "bulk booking: the same hour on many dates, with a preview"),
      e("POST", "/admin/bookings/:id/cancel", "reject a booking"), e("GET", "/admin/customers", "find a registered customer"),
    ],
  },
  {
    slug: "bookings", title: "Bookings & Payments", group: "Operations", icon: "calendar",
    summary: "Payments (Fonepay QR orders, pay-at-venue, refunds) is the second switch on this page. Court bookings made in the app (online, pay at venue, free-game voucher, guest).",
    clientFeatures: ["Slots up to 10 days ahead", "Quote, promo and voucher at checkout", "Guest vs registered rules", "10 minute QR hold", "Free cancellation until start", "Quick Rebook", "Short booking code (UF-XXXXXX)"],
    adminTasks: ["Day view and list with filters (date, status, code, phone)", "Walk-in booking", "Cancel, complete (awards points), no-show", "Upload invoice", "Record player goals and assists"],
    endpoints: [
      e("GET", "/admin/bookings", "list, filters, search"),
      e("GET", "/admin/bookings/:id", "detail + payment + stats"),
      e("POST", "/admin/bookings/walk-in", "walk-in booking"),
      e("POST", "/admin/bookings/:id/cancel", "cancel, frees slot, refund due"),
      e("POST", "/admin/bookings/:id/complete", "complete + loyalty points"),
      e("POST", "/admin/bookings/:id/no-show", "mark no-show"),
      e("POST", "/admin/bookings/:id/mark-paid", "venue payment"),
      e("PUT", "/admin/bookings/:id/player-stats", "goals / assists"),
      e("GET", "/admin/payments", "orders, filters"),
      e("GET", "/admin/payments/reconciliation", "mismatches"),
      e("GET", "/admin/payments/refunds", "refunds due / paid"),
      e("POST", "/admin/payments/:orderCode/mark-paid", "mark paid"),
      e("POST", "/admin/payments/:orderCode/refund", "record refund"),
    ],
  },
  {
    slug: "reminders", title: "Reminders", group: "Operations", icon: "bell",
    summary: "Things to remember at a set time. A pop-up shows in the portal and a phone alert is sent until someone marks it done.",
    clientFeatures: [],
    adminTasks: ["Add a reminder with a date and time, for everyone or for one staff member, once or every day", "A pop-up shows on every page when it is due, with Done and Snooze", "Phone alerts repeat every 10 minutes until it is done", "See what is left and what was done in the last 7 days"],
    endpoints: [
      e("GET", "/admin/reminders", "my reminders (everyone's for those who may view all)"), e("GET", "/admin/reminders/due", "reminders due for me now (the pop-up)"),
      e("POST", "/admin/reminders", "add a reminder"), e("PATCH", "/admin/reminders/:id", "edit"), e("DELETE", "/admin/reminders/:id", "delete"),
      e("POST", "/admin/reminders/:id/done", "mark done (a daily one sets the next day)"), e("POST", "/admin/reminders/:id/snooze", "again in 5, 10, 30 or 60 minutes"),
    ],
  },
  {
    slug: "day-check", title: "Day Check", group: "Operations", icon: "scale",
    summary: "The owner looks at the day's dashboard, enters the cash and Fonepay really received, and marks the day as checked.",
    clientFeatures: [],
    adminTasks: ["See what the portal counted for a day (cash, Fonepay, games, Gamezone, goods)", "Enter the amounts really received and see the difference", "Mark the day as checked, with a note", "Reopen a day if it was checked by mistake or the takings changed"],
    endpoints: [
      e("GET", "/admin/day-check", "a day's figures, its check and the last 14 days"), e("POST", "/admin/day-check", "mark a day as checked"), e("DELETE", "/admin/day-check/:date", "reopen a checked day"),
    ],
  },
  {
    slug: "service-funds", title: "Collect Service Payment", group: "Operations", icon: "receipt",
    summary: "Money set aside for a purpose: the 3% Charity Fund, a turf fund, maintenance, balls or anything else. Percent funds collect by themselves from every paid futsal game; withdraw when you need the money.",
    clientFeatures: ["3% Charity Fund shown with its exact amount on every booking, Gamezone, membership and bill"],
    adminTasks: ["See what each service has collected and what is still to be set aside (the Charity Fund is 3% of the takings)", "Add a service such as Maintenance or Ball amounts, with a percentage of the takings or a manual amount", "Press Deposit Amount to record money set aside, with a note and a date", "Screen every deposit later by service, date and who recorded it"],
    endpoints: [
      e("GET", "/admin/service-funds", "services with today's amount, the period, withdrawals and the balance (also makes today's automatic deposits)"),
      e("GET", "/admin/service-funds/collections", "the daily collection: games, game amount and each fund's share, for a date range"),
      e("POST", "/admin/service-funds/funds", "add a service"), e("PATCH", "/admin/service-funds/funds/:id", "edit or switch off a service"),
      e("POST", "/admin/service-funds/funds/:id/deposit", "Deposit Amount by hand"), e("POST", "/admin/service-funds/funds/:id/withdraw", "Withdraw (a reason is required, never more than the balance)"),
      e("GET", "/admin/service-funds/ledger", "deposits and withdrawals together, with date, service and kind filters"), e("GET", "/admin/service-funds/deposits", "deposits only"),
    ],
  },
  {
    slug: "ev-charging", title: "EV Charging", group: "Operations", icon: "battery",
    summary: "Paid AC EV charging at the venue: charging ports with QR codes, who is charging now, bills and payments.",
    clientFeatures: ["Quick Access > EV Charging", "Scan the QR at a charging port to start charging", "Live charging time and bill, stop when done", "Charging and payment history", "Pay at the venue"],
    adminTasks: ["Add charging ports and print each port's QR code (a new QR switches the old one off)", "See who is charging now and stop a session if the customer forgot", "Collect an unpaid charge in cash, Fonepay QR or both", "Record a walk-in charge that is paid straight away", "History with search and status, revenue today and for 30 days (also in Payments > EV charging)"],
    endpoints: [
      e("GET", "/admin/ev-charging", "sessions, live list, revenue and unpaid totals"), e("GET", "/admin/ev-charging/ports", "ports with in-use status"),
      e("POST", "/admin/ev-charging/ports", "add a port (also PATCH, DELETE)"), e("POST", "/admin/ev-charging", "walk-in charge, paid now"),
      e("POST", "/admin/ev-charging/:id/stop", "stop a running session and make the bill"), e("POST", "/admin/ev-charging/:id/pay", "collect an unpaid session"), e("POST", "/admin/ev-charging/:id/cancel", "cancel without a bill"),
    ],
  },
  {
    slug: "courts", title: "Courts & Pricing", group: "Admin", icon: "grid",
    summary: "Hourly prices per shift and blocked slots.",
    clientFeatures: ["Morning / Day / Evening prices", "Free hours listed per date", "One pool of hours (court count undecided)"],
    adminTasks: ["Edit price per shift and hour", "Block slots for maintenance or events", "View slot occupancy"],
    endpoints: [
      e("GET", "/admin/courts/pricing", "prices"),
      e("PUT", "/admin/courts/pricing", "edit prices"),
      e("GET", "/admin/courts/slots", "day view"),
      e("GET", "/admin/courts/blocks", "blocked hours"),
      e("POST", "/admin/courts/blocks", "block hours"),
      e("DELETE", "/admin/courts/blocks/:id", "unblock"),
    ],
  },
  {
    slug: "digital-id", title: "Digital ID", group: "Customers", icon: "scan",
    summary: "Scan a customer's QR with the camera to open their profile and activity. Also marks membership attendance.",
    clientFeatures: ["Personal Digital ID card with a private QR", "Download the card or open it from the header", "QR holds no personal data and only works inside Unique Futsal"],
    adminTasks: ["Scan the QR with a phone or tablet camera", "Search by name or number if the camera fails", "See bookings, points, referrals, Gamezone, add-ons and total spent", "Mark membership attendance", "Send the ID card to a customer on WhatsApp"],
    endpoints: [
      e("POST", "/admin/digital-id/resolve", "QR text to customer"), e("GET", "/admin/digital-id/search", "manual search"),
      e("GET", "/admin/digital-id/:phone", "profile and extras"), e("GET", "/admin/digital-id/:phone/card", "card data for download or WhatsApp"),
      e("POST", "/admin/digital-id/:phone/attendance", "mark membership attendance for today"),
    ],
  },
  {
    slug: "customers", title: "Customers", group: "Customers", icon: "users",
    summary: "Registered players (phone + password, Google link for reset).",
    clientFeatures: ["Profile, location, position", "Preferences (SMS, promo, pop-up)", "Player / Captain mode", "Booking and payment history", "Gameplay stats"],
    adminTasks: ["Search and open a customer (profile, bookings, points, team)", "Add a customer by hand (name, mobile, optional email, optional app password)", "Edit details", "Suspend / unsuspend", "Anonymise on request (money records kept)"],
    endpoints: [
      e("GET", "/admin/customers", "list with games, paid, unpaid and open complaints; filter captains / players"),
      e("POST", "/admin/customers", "add a customer by hand; with a password they can sign in to the app, without one it is a record only"),
      e("GET", "/admin/customers/:phone/profile", "games, payments, extra items, complaints, tournaments, captain profile, promo settings"),
      e("PUT", "/admin/customers/:phone/promos", "switch a promo code (or all) on or off for one customer"),
      e("PATCH", "/admin/customers/:phone", "edit name or email"),
      e("POST", "/admin/customers/:phone/suspend", "suspend (and /unsuspend)"),
    ],
  },
  {
    slug: "goal-rush", title: "Goal Rush", group: "Customers", icon: "trophy",
    summary: "Unique Goal Rush, the penalty game in the customer app: games, goals, saves, the loyalty points it gave and anything that looks odd.",
    clientFeatures: ["Home card under Quick Access: Play & Earn Now", "5 penalties against a goalkeeper played by the server", "1 loyalty point for a finished game with 3 or more goals (every 3 goals = 1 point)", "3 games a day (every game started counts), 3 points a day at most", "Guests can play practice games without points"],
    adminTasks: ["Totals for all time, today and this month: games, players, goals, saves, misses, points", "Games per day for the last 14 days", "Every game with its result and the loyalty reward reference", "Players to look at: many perfect games, very fast games or many unfinished games", "Correct a reward in Loyalty Points > Adjust (logged with the reason)"],
    endpoints: [
      e("GET", "/admin/goal-rush", "totals, games per day, flags and the games list"),
      e("GET", "/admin/goal-rush/:id", "one game shot by shot with its reward"),
    ],
  },
  {
    slug: "gift-card", title: "Gift Card", group: "Customers", icon: "gift",
    summary: "Loyalty points and games customers bought for a friend in the app, paid with Fonepay.",
    clientFeatures: ["Gift Card in Quick Access: Buy Loyalty Points for my friend (Rs. 10 a point, 10 to 500) or Book Game Instead (a 1-hour game in the friend's name, paid by the buyer)", "The friend must be registered; both are notified when it is paid", "Up to 5 gifts a day per customer; a gifted game cannot be cancelled in the app"],
    adminTasks: ["See every gift: who bought it, for whom, points or game, amount, payment and delivery", "Filter by type, status and date, and search by code, name or number", "Cancel a paid gift: the game is cancelled or the points are taken back, and the buyer's money goes on Payments > Refunds"],
    endpoints: [
      e("GET", "/admin/gifts", "gifts with totals, filters and search"), e("GET", "/admin/gifts/:id", "one gift"),
      e("POST", "/admin/gifts/:id/cancel", "cancel a paid gift and put the refund on the Refunds list"),
    ],
  },
  {
    slug: "refer", title: "Refer & Earn", group: "Customers", icon: "handshake",
    summary: "A customer books a game for another team: you check it and both get loyalty points.",
    clientFeatures: ["Popular > Refer & Earn", "Pick the booking made for the other team, the captain's number and team name", "Both people are told when you decide", "Withdraw while waiting"],
    adminTasks: ["See referrals waiting, approved and rejected", "Approve (change the points first if needed) or reject with a reason", "Adjust the points of an approved referral", "Set the points for each side and pause the feature", "Call either person"],
    endpoints: [
      e("GET", "/admin/refer", "list, status filter, search"), e("GET", "/admin/refer/counts", "counts per status"), e("GET", "/admin/refer/overview", "totals and rules"),
      e("PATCH", "/admin/refer/:id", "change points while waiting"), e("POST", "/admin/refer/:id/approve", "gives both customers their points"),
      e("POST", "/admin/refer/:id/reject", "reason, customer told"), e("POST", "/admin/refer/:id/adjust", "change points after approval"),
      e("GET", "/admin/refer/settings", "points and on/off"), e("PUT", "/admin/refer/settings", "save points, pause"),
    ],
  },
  {
    slug: "membership", title: "Membership, UC & Children's Academy", group: "Customers", icon: "badge",
    summary: "The Children's Academy (football classes for ages 10 to 14: class times, enrolled children, terms) is the third switch on this page. Monthly / 3 / 6 month plans by shift (Basic, Premium), and Unique Club (Rs. 1,500 for 30 days, 10% off) on its own switch at the top.",
    clientFeatures: ["Membership ID (MEM-10291), status Active / Expiring soon / Expired / Suspended", "Offers with discounted prices per shift", "A fixed hour on chosen weekdays, held for the member", "4 PM to 8 PM never offered", "Points for 3 and 6 month plans", "Notices: activated, expiring, expired, renewed", "Unique Club page in Quick Access: pay Rs. 1,500 with the Fonepay QR, active at once for 30 days, 10% off court bookings and Gamezone from day one, no promo or VIP code with the club discount"],
    adminTasks: ["Unique Club switch: see club members by status (active, expiring in 7 days, expired), search by name or mobile number, see joined and end dates, payments and the discount given (the Rs. 1,500 payments are in Payments > Unique Club)", "Plans CRUD and featured plan (Courts > Membership)", "Members list by status with search by name, phone or Membership ID", "New member with live price and free-hour check, pay now (cash / Fonepay QR) or pay later", "Verify payment (activates)", "Renew (paid now), extend free days, suspend, resume, cancel", "WhatsApp reminder and invoice", "The member hour shows as MEMBER HOLD on Slots and cannot be booked by staff"],
    endpoints: [
      e("GET", "/admin/club", "Unique Club members with status, dates, payments, discount given and totals"), e("GET", "/admin/payments/ledger?kind=club", "the Rs. 1,500 club payments"),
      e("GET", "/admin/membership/plans", "plans with the shift x 1/3/6 month price matrix"),
      e("POST", "/admin/membership/plans", "create a plan"),
      e("PUT", "/admin/membership/plans/:id", "edit prices, perks, featured, active"),
      e("GET", "/admin/membership/subscriptions", "members by status (pending, active, expiring, expired, suspended, cancelled), search, counts"),
      e("GET", "/admin/membership/subscriptions/:id", "one member with payments and earlier memberships"),
      e("POST", "/admin/membership/subscriptions", "new member (dryRun checks price and free hour); pay now or leave pending"),
      e("POST", "/admin/membership/subscriptions/:id/verify", "verify payment, activate, points"),
      e("POST", "/admin/membership/subscriptions/:id/renew", "renew, paid now"),
      e("POST", "/admin/membership/subscriptions/:id/extend", "free extra days with a reason"),
      e("POST", "/admin/membership/subscriptions/:id/suspend", "suspend, /resume, /cancel"),
      e("GET", "/admin/academy/overview", "counts"), e("GET", "/admin/academy/sessions", "classes, upcoming or past"),
      e("POST", "/admin/academy/sessions", "add (optionally repeat weekly)"), e("PATCH", "/admin/academy/sessions/:id", "edit, show or hide"),
      e("POST", "/admin/academy/sessions/:id/cancel", "cancel and tell guardians"), e("GET", "/admin/academy/enrollments", "enrolled children, filters"),
      e("POST", "/admin/academy/enrollments/:id/attendance", "attended or no-show"), e("POST", "/admin/academy/enrollments/:id/cancel", "cancel one enrolment"),
      e("GET", "/admin/academy/terms", "current terms and history"), e("PUT", "/admin/academy/terms", "save a new version"),
    ],
  },
  {
    slug: "loyalty", title: "Loyalty Points", group: "Customers", icon: "star",
    summary: "Points ledger, expiry and free-game vouchers.",
    clientFeatures: ["Game points price/100, goods Rs.100 = 1 (at most 10 points a day from items)", "Expiry (game 3 months, goods 1 year)", "Claim a free game voucher per shift", "Expiring-soon warnings"],
    adminTasks: ["Numbers for 7 / 30 days or this month: points given by kind, spent, owed now, expiring in 30 days", "Customers with points: search, sort, open one for the ledger, vouchers and an adjustment with a reason", "Activity feed of every earning and spending, with filters", "Free-game vouchers across customers, void an unused one", "Goods points come from Sell goods in Inventory"],
    endpoints: [
      e("GET", "/admin/loyalty/overview", "given, spent, owed, expiring soon, vouchers"), e("GET", "/admin/loyalty/customers", "customers with points (q, sort, page)"),
      e("GET", "/admin/loyalty/ledger", "all entries (kind, dates, q)"), e("GET", "/admin/loyalty/vouchers", "all vouchers (status)"),
      e("GET", "/admin/loyalty/customers/:phone", "ledger + vouchers"),
      e("POST", "/admin/loyalty/goods-sale", "goods sale + points"),
      e("POST", "/admin/loyalty/adjust", "manual adjust (manager+)"),
      e("POST", "/admin/loyalty/vouchers/:id/void", "void voucher"),
    ],
  },
  {
    slug: "promos", title: "Promocodes & VIP", group: "Customers", icon: "tag",
    summary: "Codes shown on Home and the Promos page, validated at booking, and VIP Privilege (a special code for one customer) on its own switch at the top.",
    clientFeatures: ["Active / Upcoming / Expired tabs", "Copy code", "Ends in N days", "Server-side validation", "VIP: promo code box on the booking screen; the VIP code is typed once, then applied to every booking automatically; the bigger of the VIP discount and a normal promo code is used"],
    adminTasks: ["VIP Privilege switch: pick a customer and make a code (or type your own, for example VIP), choose a percent or a rupee amount off, share it on WhatsApp, pause, change or remove it, and see who has typed it, how many games it discounted and how much it saved", "Create a code: percent or rupees off, last day, days of the week, slot hours, bookings and/or memberships", "See what customers will read before saving", "Pause or resume a code with one switch", "Edit, delete, copy, share on WhatsApp", "Each code shows how often it was used and the discount given"],
    endpoints: [
      e("GET", "/admin/vip", "all VIP customers with usage and totals"), e("GET", "/admin/vip/generate-code", "a fresh unused code"),
      e("POST", "/admin/vip", "give a customer a VIP code"), e("PUT", "/admin/customers/:phone/vip", "change or pause"), e("DELETE", "/admin/customers/:phone/vip", "remove"),
      e("GET", "/admin/promos", "list with state (live, paused, expired), times used and discount given"), e("PATCH", "/admin/promos/:code/active", "pause or resume"),
      e("POST", "/admin/promos", "create"),
      e("PUT", "/admin/promos/:code", "edit"),
      e("DELETE", "/admin/promos/:code", "remove"),
      e("GET", "/admin/promos/usage", "usage report"),
    ],
  },
  {
    slug: "teams", title: "Teams & Challenges", group: "Customers", icon: "swords",
    summary: "Captain mode: teams (max 12), challenges, results and ratings.",
    clientFeatures: ["Create team, roster by phone", "Challenge with loser pays 70 / 60 / 100%", "Winning captain uploads score, other approves", "Team rating, ranking, form", "\"Did you win?\" prompt", "Disputed scores change no records until resolved"],
    adminTasks: ["Teams with captain, roster size, record and form; open a team for its players and challenges", "Challenges by status with both teams, court price, loser-pays rule, venue payment and score", "Results to review: approve (or correct) or void a disputed score", "Venue payments: who owes what, mark paid (prompts captains)"],
    endpoints: [
      e("GET", "/admin/teams", "all teams with captain, roster size, record, form (search with q)"), e("GET", "/admin/teams/overview", "counts for the top of the page"),
      e("GET", "/admin/teams/:id", "one team: players and challenges"), e("GET", "/admin/teams/challenges", "all challenges, status filter and search"), e("GET", "/admin/teams/disputes", "disputed results"), e("POST", "/admin/teams/results/:id/resolve", "approve / void a result"),
      e("GET", "/admin/teams/settlements", "who owes what"),
      e("POST", "/admin/teams/challenges/:id/venue-paid", "mark paid, prompts captains"),
    ],
  },
  {
    slug: "tournaments", title: "Tournaments", group: "Community", icon: "trophy",
    summary: "Tournaments, registrations and the tie-sheet shown in the app.",
    clientFeatures: ["Current tournament and tie-sheet", "Tournament Popular tile and notices"],
    adminTasks: ["See every tournament with registrations and live matches", "Edit rounds, teams, times and venues", "Kick off, add goals (minute, scorer), full time, correct scores", "Followers are notified at once (bell and phone alert)", "Share a private host link so the match-day host can do the same without signing in", "Create and edit tournaments (still in the customer backend)"],
    endpoints: [
      e("GET", "/admin/tournaments/:id/registrations", "teams that signed up from the registration link"), e("PATCH", "/admin/tournaments/:id/registrations/:rid", "confirm or reject a team"),
      e("POST", "/admin/tournaments", "register a hosted tournament: host, rate, days and hours (dryRun checks the hours); holds the court"), e("GET", "/admin/tournaments/hosted", "hosted events with total, received and due"),
      e("GET", "/admin/tournaments/:id/billing", "the bill: court hours, goods, charges, discounts, payments"), e("POST", "/admin/tournaments/:id/items", "take goods from the shop onto the bill"),
      e("POST", "/admin/tournaments/:id/hours", "add court time: a new day or more hours on a held day (dryRun checks and prices it)"), e("POST", "/admin/tournaments/:id/lines", "extra charge or discount"), e("POST", "/admin/tournaments/:id/payments", "receive cash and/or Fonepay"), e("POST", "/admin/tournaments/:id/final-bill", "make the final bill (reopen-bill undoes it)"),
      e("GET", "/admin/tournaments", "list with counts"), e("GET", "/admin/tournaments/:id", "tie-sheet with goals, host link"),
      e("PUT", "/admin/tournaments/:id/tiesheet", "save rounds, teams, times, venues (live scores kept)"),
      e("POST", "/admin/tournaments/matches/:id/goal", "add a goal"), e("DELETE", "/admin/tournaments/goals/:id", "take a goal back"),
      e("POST", "/admin/tournaments/matches/:id/status", "kick off, full time, reopen, correct the score"),
      e("POST", "/admin/tournaments/:id/host-link", "create or renew the host link"), e("DELETE", "/admin/tournaments/:id/host-link", "switch it off"),
      e("GET", "/admin/host/:token", "host link: the tie-sheet (no staff sign-in)"),
    ],
  },
  {
    slug: "gamezone", title: "Gamezone (PS5)", group: "Gamezone", icon: "gamepad",
    summary: "PS5 sessions per console, game and player count.",
    clientFeatures: ["Pick console then game", "Solo 300 / 2 players 200 / 4 players 150 per hour each", "1 to 4 hours, 10 AM to 10 PM", "Pay at venue or online"],
    adminTasks: ["Bookings and mark paid", "Manage consoles, games and plans (rates)", "Gamezone invoices"],
    endpoints: [
      e("GET", "/admin/gamezone/bookings", "sessions"),
      e("POST", "/admin/gamezone/bookings/:code/mark-paid", "mark paid"),
      e("POST", "/admin/gamezone/bookings/:code/complete", "complete"),
      e("POST", "/admin/gamezone/bookings/:code/cancel", "cancel + refund due"),
      e("GET", "/admin/gamezone/catalog", "consoles, games, plans"),
      e("POST", "/admin/gamezone/consoles", "add console"),
      e("POST", "/admin/gamezone/games", "add game"),
      e("PUT", "/admin/gamezone/plans/:players", "rate"),
    ],
  },
  {
    slug: "complaints", title: "Complaints", group: "Customers", icon: "alert",
    summary: "What customers report from the app, with photos, and your replies.",
    clientFeatures: ["Popular > Complaints", "Category, message, optional booking code and up to 3 photos", "Status and the venue's reply shown to the customer", "5 complaints per customer per day"],
    adminTasks: ["See every complaint by status, category, name, phone or code", "View the photos", "Reply and change the status (the customer is notified)", "Call the customer"],
    endpoints: [
      e("GET", "/admin/complaints", "list, filters, search"), e("GET", "/admin/complaints/counts", "counts per status"),
      e("GET", "/admin/complaints/:id", "one complaint"), e("PATCH", "/admin/complaints/:id", "status and reply, notifies the customer"),
    ],
  },
  {
    slug: "wheelchair", title: "Wheelchair & Health Insurance", group: "Customers", icon: "wheelchair",
    summary: "Wheelchair visits (so the ramp and help are ready) and injury insurance claims with photos, the witness (in Nepali too) and the patient's emergency contact, on one page with a switch at the top.",
    clientFeatures: ["Quick Access > Wheelchair Request", "Day, about what time, how many wheelchair users, note, optional booking code", "Status and the venue's reply shown to the customer", "Customer can cancel until it is done", "Quick Access > Claim Insurance: photo of the incident, patient name and registered number, witness name in English and Nepali, Minor or Emergency; for an emergency, slide to call the patient's emergency contact"],
    adminTasks: ["Insurance Claims switch: see claims by status and injury case (emergencies first), view the photos, the witness and the patient's emergency contact, start review, approve, reject or close (the filer and the patient are notified), and reply with a message", "See requests by status, newest visit first", "Confirm, decline or mark done (the customer is notified)", "Reply with a message", "Call the customer"],
    endpoints: [
      e("GET", "/admin/insurance", "claims: list, status and case filters, search"), e("GET", "/admin/insurance/counts", "counts per status"),
      e("GET", "/admin/insurance/:id", "one claim"), e("PATCH", "/admin/insurance/:id", "status and reply, notifies the filer and the patient"),
      e("GET", "/admin/wheelchair", "list, status filter, search"), e("GET", "/admin/wheelchair/counts", "counts per status"),
      e("GET", "/admin/wheelchair/:id", "one request"), e("PATCH", "/admin/wheelchair/:id", "status and reply, notifies the customer"),
    ],
  },
  {
    slug: "marketplace", title: "Partner Marketplace", group: "Operations", icon: "handshake",
    summary: "Cafes, swimming pools and other businesses that give our customers a discount for loyalty points: agreement, discount codes, points, and the partner's own dashboard link.",
    clientFeatures: ["Partner offers and banners on the Loyalty Points page", "A Partners tile in Quick Access while a partnership is active", "A customer spends loyalty points on a discount and gets a card with a code to show at the partner", "A loyalty card with the balance and the latest points earned, as proof for a partner"],
    adminTasks: ["Register a partner: name, category, contact, agreement start and end dates, banner", "Set the discount codes and how many loyalty points each discount costs, and how many times one customer may use it", "Pause a partner or an offer, edit codes and points at any time", "Make or switch off the partner's dashboard link", "See the customers who used a discount, and cancel a card (the points go back)"],
    endpoints: [
      e("GET", "/admin/marketplace", "all partners with offers, link and card counts"), e("POST", "/admin/marketplace", "register a partner (with its first offers)"),
      e("PATCH", "/admin/marketplace/:id", "details, agreement dates, on or off, banner"), e("DELETE", "/admin/marketplace/:id", "delete a partner nobody has used yet"),
      e("POST", "/admin/marketplace/:id/offers", "add a discount"), e("PATCH", "/admin/marketplace/:id/offers/:oid", "edit code, text, points, limit, on or off"), e("DELETE", "/admin/marketplace/:id/offers/:oid", "delete (or switch off when used)"),
      e("POST", "/admin/marketplace/:id/link", "make a new dashboard link"), e("DELETE", "/admin/marketplace/:id/link", "switch the link off"),
      e("GET", "/admin/marketplace/:id/redemptions", "customers who used a discount"), e("POST", "/admin/marketplace/redemptions/:rid/cancel", "cancel a card and return the points"),
      e("GET", "/admin/partner/:token", "the partner's own dashboard (no staff sign-in)"), e("POST", "/admin/partner/:token/verify", "check a card code"),
      e("POST", "/admin/partner/:token/redemptions/:rid/used", "mark a card used"), e("POST", "/admin/partner/:token/banner", "the partner changes its banner"),
    ],
  },
  {
    slug: "content", title: "Pop-Ups and Site Content", group: "Operations", icon: "image",
    summary: "Pop-up ads, gallery photos, Corporate Network logos and customer notices: header, footer, in-page and pop-up ads, looping and time-targeted.",
    clientFeatures: ["Gallery on Home (landscape and portrait)", "Header, footer and in-page ad banners that loop", "Pop-up ads with a delay and a frequency", "Ads that run only at set hours, dates or weekdays", "Bell notices that drive the Popular tile badges, and Web Push (needs VAPID keys)", "\"Corporate Network. We Trusted\" strip on Home, between the promo codes and the founder message, with logos that move across the screen and pause when touched"],
    adminTasks: ["Upload gallery photos, rename, reorder, hide or delete", "Add ads with a picture, link, place and seconds per ad", "Target an ad by hours (for example 6:00 to 7:00 AM for one hour), dates and weekdays", "Pause, edit or delete an ad", "See views and clicks", "Notifications tab: send promo / tournament / general notices to all customers, team captains or one customer, see how many it reaches before sending and how many opened it (promo opt-outs are skipped)", "Corporate Network tab: upload a logo with the organisation name, rename, replace the picture, hide or delete it, and choose the order", "Birthdays tab: see customers whose birthday is today, select some or all, and send a happy birthday wish with an optional promo code gift"],
    endpoints: [
      e("GET", "/admin/content/overview", "photos, live ads, views, clicks"), e("GET", "/admin/content/gallery", "all photos"),
      e("POST", "/admin/content/gallery", "upload a photo"), e("PATCH", "/admin/content/gallery/:id", "title, caption, show or hide"),
      e("POST", "/admin/content/gallery/reorder", "save the order"), e("DELETE", "/admin/content/gallery/:id", "delete a photo"),
      e("GET", "/admin/content/ads", "all ads with live status"), e("POST", "/admin/content/ads", "add an ad"),
      e("PATCH", "/admin/content/ads/:id", "edit, pause, replace the picture"), e("DELETE", "/admin/content/ads/:id", "delete an ad"),
      e("POST", "/admin/notifications/broadcast", "promo / tournament / general notice to all, captains or one customer"), e("GET", "/admin/notifications/reach", "how many customers a notice would reach"), e("GET", "/admin/notifications/history", "sent notices with opened counts"),
      e("GET", "/admin/content/partners", "all Corporate Network logos"), e("POST", "/admin/content/partners", "add a logo and its name"),
      e("PATCH", "/admin/content/partners/:id", "rename, show or hide, replace the picture"), e("POST", "/admin/content/partners/reorder", "save the order"),
      e("DELETE", "/admin/content/partners/:id", "delete a logo"),
      e("GET", "/admin/content/birthdays", "customers with a birthday today, and the promo codes that can be given"), e("POST", "/admin/content/birthdays/wish", "send happy birthday (with or without a promo code) to the selected customers"),
    ],
  },
  {
    slug: "verify", title: "Verify Document", group: "Communication", icon: "shield",
    summary: "Verification codes for bills and for documents you give to schools, banks and colleges. Anyone can check a code on the customer site.",
    clientFeatures: ["Verify Documents in Quick Access: type a 5-character code (like 1234A) to see if a bill or document is genuine", "A verification code on every receipt in Payment history and its PDF", "Genuine: the bill or document details; not genuine: a clear warning"],
    adminTasks: ["Make a code for a document (reference letter, partnership, agreement) with the organisation, notes and photos", "Withdraw a code so it no longer verifies, or restore it", "Look up any code", "See the codes of recent bills; invoices sent on WhatsApp carry the bill code"],
    endpoints: [
      e("GET", "/admin/verify", "document codes and the codes of recent bills"), e("GET", "/admin/verify/lookup/:code", "what a code is and whether it still verifies"),
      e("GET", "/admin/verify/bill-code", "the code of a bill (made on first use)"), e("POST", "/admin/verify/documents", "make a code for a document, with photos"),
      e("PATCH", "/admin/verify/:id", "withdraw or restore a code"),
    ],
  },
  {
    slug: "letter-head", title: "Letter Head", group: "Operations", icon: "letter",
    summary: "Write a letter on the Unique Futsal letter head and send it on WhatsApp as a PDF. Each letter gets a verification number.",
    clientFeatures: ["Anyone can check a letter's verification number at Verify Documents"],
    adminTasks: ["Write a custom letter (up to 150 words) with its subject, receiver and date", "Keep the registration number and website printed on the letter head", "Send the PDF on WhatsApp or download it", "Find any letter again by its reference number or verification number, and withdraw or restore it"],
    endpoints: [
      e("GET", "/admin/letter-head", "company details for the letter head"), e("PUT", "/admin/letter-head", "save the registration number and website"), e("POST", "/admin/letter-head/issue", "a new letter's reference number (2026-123) and verification number"), e("GET", "/admin/letter-head/letters", "find letters by reference no., verification no., subject or receiver"),
    ],
  },
  {
    slug: "overview", title: "Overview and Reports", group: "Business", icon: "chart",
    summary: "Revenue, occupancy, no-shows and loyalty liability.",
    clientFeatures: ["Price, promo and loyalty rules live on the server"],
    adminTasks: ["Pick Today, Yesterday, Last 7 / 30 days, This month or a custom range", "Sales (Fonepay and cash) by day and by source, compared with the period before", "Games: paid, unpaid, average rate, cancelled, no-shows, who booked", "Busy hours and weekdays", "Promo code use and best customers", "Membership and loyalty standing", "Send on WhatsApp and download a PDF"],
    endpoints: [
      e("GET", "/admin/reports/summary", "everything above for a period in one call"),
      e("GET", "/admin/dashboard", "today's numbers"),
      e("GET", "/admin/reports/revenue", "revenue by day and method"),
      e("GET", "/admin/reports/occupancy", "booked hours, no-shows"),
      e("GET", "/admin/reports/loyalty-liability", "points owed"),
    ],
  },
  {
    slug: "staff", title: "Staff & Roles", group: "Admin", icon: "key",
    summary: "Who may use the portal and what they may do.",
    clientFeatures: [],
    adminTasks: ["Owner only: add admin accounts (everything except accounts) and staff accounts (only what you tick)", "Tick small permissions for each staff member, one per action", "Disable an account or reset a password"],
    endpoints: [
      e("GET", "/admin/staff", "all accounts with what each can do"), e("GET", "/admin/staff/catalog", "the permission sections with their tick boxes, and quick-start presets"),
      e("POST", "/admin/staff", "create an admin or staff account"), e("PATCH", "/admin/staff/:id", "change access, disable, reset password"),
    ],
  },
  {
    slug: "audit", title: "Audit Log", group: "Admin", icon: "list",
    summary: "Who changed what and when.",
    clientFeatures: [],
    adminTasks: ["Search a name, record code, phone or any word in the details", "Filter by staff, what changed, action and date (Today, Yesterday, custom)", "Open an entry to see what was saved", "Download the filtered log"],
    endpoints: [
      e("GET", "/admin/audit", "filter by entity, action, staff, record id, from / to dates and search text"),
      e("GET", "/admin/audit/filters", "staff, entities and actions with counts, and today / 7 days / all-time totals"),
    ],
  },
  {
    slug: "settings", title: "Settings", group: "Admin", icon: "settings",
    summary: "Venue settings and integrations.",
    clientFeatures: ["Footer, Help page and the Call / WhatsApp buttons show the venue details", "Venue Wi-Fi", "Advance deposit when booking"],
    adminTasks: ["Edit venue name, phone, WhatsApp, email, address, social links and map", "Venue Wi-Fi name and password", "Booking advance deposit", "See Fonepay (test or live), push and database status", "Change my password"],
    endpoints: [
      e("GET", "/admin/settings", "venue details, Wi-Fi, deposit and integration status (no secrets)"),
      e("PUT", "/admin/settings/venue", "save venue details"), e("PUT", "/admin/settings/wifi", "save Wi-Fi"), e("PUT", "/admin/settings/booking", "save the advance deposit"),
    ],
  },
];

export const groups = ["Operations", "Customers", "Community", "Gamezone", "Communication", "Business", "Admin"];

export const findModule = (slug: string) => modules.find((m) => m.slug === slug);
