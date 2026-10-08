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
    clientFeatures: ["Free hours listed per date", "Pay at venue or online", "Guest vs registered customers", "Free cancellation until start"],
    adminTasks: ["See a whole day at once (booked, completed, open, blocked)", "Tap + to book a customer by hand (walk-in or phone)", "Bulk booking: the same hour on many dates (chosen weekdays such as Tue, Thu, Sun for N weeks, every day, or picked dates), checked before it is booked", "Log a game that already happened", "Reject (cancel) a booking"],
    endpoints: [
      e("GET", "/admin/courts/slots", "all hours of a date with who booked them"), e("POST", "/admin/bookings/walk-in", "manual booking"), e("POST", "/admin/bookings/walk-in/bulk", "bulk booking: the same hour on many dates, with a preview"),
      e("POST", "/admin/bookings/:id/cancel", "reject a booking"), e("GET", "/admin/customers", "find a registered customer"),
    ],
  },
  {
    slug: "bookings", title: "Bookings", group: "Operations", icon: "calendar",
    summary: "Court bookings made in the app (online, pay at venue, free-game voucher, guest).",
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
    ],
  },
  {
    slug: "arrivals", title: "Arrivals", group: "Operations", icon: "bell",
    summary: "\"I'm coming\" check-ins sent by customers from 1 hour before kickoff.",
    clientFeatures: ["Full-screen \"I'm coming\" slider", "Pop-up reminder setting", "Check-in window: 1h before to 30 min after"],
    adminTasks: ["Live list of customers on the way (court and Gamezone)", "Badge or sound for new check-ins"],
    endpoints: [
      e("GET", "/admin/arrivals", "today's I'm coming check-ins"),
    ],
  },
  {
    slug: "payments", title: "Payments", group: "Operations", icon: "wallet",
    summary: "Fonepay QR orders, pay-at-venue and refunds.",
    clientFeatures: ["QR with remarks, valid 10 minutes", "Status polling (paid is never trusted from the browser)", "Pay at venue (registered only)", "Free cancel creates a refund due"],
    adminTasks: ["Mark venue payments paid", "Refund queue (REFUND_DUE events)", "Reconciliation list", "Failed or expired orders and gateway callbacks"],
    endpoints: [
      e("GET", "/admin/payments", "orders, filters"),
      e("GET", "/admin/payments/reconciliation", "mismatches"),
      e("GET", "/admin/payments/refunds", "refunds due / paid"),
      e("POST", "/admin/payments/:orderCode/mark-paid", "mark paid"),
      e("POST", "/admin/payments/:orderCode/refund", "record refund"),
    ],
  },
  {
    slug: "courts", title: "Courts & Pricing", group: "Operations", icon: "grid",
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
    slug: "vip", title: "VIP Privilege", group: "Customers", icon: "crown",
    summary: "Give a customer a special code. They type it once and get a discount on every game.",
    clientFeatures: ["Promo code box on the booking screen", "The VIP code is typed once, then applied to every booking automatically", "The bigger of the VIP discount and a normal promo code is used"],
    adminTasks: ["Pick a customer and make a code (or type your own, for example VIP)", "Choose a percent or a rupee amount off", "Share the code on WhatsApp", "Pause, change or remove it", "See who has typed it, how many games it discounted and how much it saved"],
    endpoints: [
      e("GET", "/admin/vip", "all VIP customers with usage and totals"), e("GET", "/admin/vip/generate-code", "a fresh unused code"),
      e("POST", "/admin/vip", "give a customer a VIP code"), e("PUT", "/admin/customers/:phone/vip", "change or pause"), e("DELETE", "/admin/customers/:phone/vip", "remove"),
    ],
  },
  {
    slug: "membership", title: "Membership", group: "Customers", icon: "badge",
    summary: "Monthly / 3 / 6 month plans by shift (Basic, Premium).",
    clientFeatures: ["Membership ID (MEM-10291), status Active / Expiring soon / Expired / Suspended", "Offers with discounted prices per shift", "A fixed hour on chosen weekdays, held for the member", "4 PM to 8 PM never offered", "Points for 3 and 6 month plans", "Notices: activated, expiring, expired, renewed"],
    adminTasks: ["Plans CRUD and featured plan (Courts > Membership)", "Members list by status with search by name, phone or Membership ID", "New member with live price and free-hour check, pay now (cash / Fonepay QR) or pay later", "Verify payment (activates)", "Renew (paid now), extend free days, suspend, resume, cancel", "WhatsApp reminder and invoice", "The member hour shows as MEMBER HOLD on Slots and cannot be booked by staff"],
    endpoints: [
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
    ],
  },
  {
    slug: "loyalty", title: "Loyalty Points", group: "Customers", icon: "star",
    summary: "Points ledger, expiry and free-game vouchers.",
    clientFeatures: ["Game points price/100, goods Rs.100 = 1", "Expiry (game 3 months, goods 1 year)", "Claim a free game voucher per shift", "Expiring-soon warnings"],
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
    slug: "promos", title: "Promo Codes", group: "Customers", icon: "tag",
    summary: "Codes shown on Home and the Promos page, validated at booking.",
    clientFeatures: ["Active / Upcoming / Expired tabs", "Copy code", "Ends in N days", "Server-side validation"],
    adminTasks: ["Create a code: percent or rupees off, last day, days of the week, slot hours, bookings and/or memberships", "See what customers will read before saving", "Pause or resume a code with one switch", "Edit, delete, copy, share on WhatsApp", "Each code shows how often it was used and the discount given"],
    endpoints: [
      e("GET", "/admin/promos", "list with state (live, paused, expired), times used and discount given"), e("PATCH", "/admin/promos/:code/active", "pause or resume"),
      e("POST", "/admin/promos", "create"),
      e("PUT", "/admin/promos/:code", "edit"),
      e("DELETE", "/admin/promos/:code", "remove"),
      e("GET", "/admin/promos/usage", "usage report"),
    ],
  },
  {
    slug: "teams", title: "Teams & Challenges", group: "Community", icon: "shield",
    summary: "Captain mode: teams (max 12), challenges, results and ratings.",
    clientFeatures: ["Create team, roster by phone", "Challenge with loser pays 70 / 60 / 100%", "Winning captain uploads score, other approves", "Team rating, ranking, form", "\"Did you win?\" prompt"],
    adminTasks: ["Teams with captain, roster size, record and form; open a team for its players and challenges", "Challenges by status with both teams, court price, loser-pays rule, venue payment and score", "Results to review: approve (or correct) or void a disputed score", "Venue payments: who owes what, mark paid (prompts captains)"],
    endpoints: [
      e("GET", "/admin/teams", "all teams with captain, roster size, record, form (search with q)"), e("GET", "/admin/teams/overview", "counts for the top of the page"),
      e("GET", "/admin/teams/:id", "one team: players and challenges"), e("GET", "/admin/teams/challenges", "all challenges, status filter and search"),
      e("GET", "/admin/teams/settlements", "who owes what"),
      e("POST", "/admin/teams/challenges/:id/venue-paid", "mark paid, prompts captains"),
    ],
  },
  {
    slug: "disputes", title: "Disputed Results", group: "Community", icon: "scale",
    summary: "Scores the other captain disputed.",
    clientFeatures: ["Approve or dispute a score", "Disputed results change no records until resolved"],
    adminTasks: ["Review both scores side by side", "Approve, override or void with a note"],
    endpoints: [
      e("GET", "/admin/teams/disputes", "disputed results"),
      e("POST", "/admin/teams/results/:id/resolve", "approve / void"),
    ],
  },
  {
    slug: "tournaments", title: "Tournaments", group: "Community", icon: "trophy",
    summary: "Tournaments, registrations and the tie-sheet shown in the app.",
    clientFeatures: ["Current tournament and tie-sheet", "Tournament Popular tile and notices"],
    adminTasks: ["See every tournament with registrations and live matches", "Edit rounds, teams, times and venues", "Kick off, add goals (minute, scorer), full time, correct scores", "Followers are notified at once (bell and phone alert)", "Share a private host link so the match-day host can do the same without signing in", "Create and edit tournaments (still in the customer backend)"],
    endpoints: [
      e("POST", "/admin/tournaments", "register a hosted tournament: host, rate, days and hours (dryRun checks the hours); holds the court"), e("GET", "/admin/tournaments/hosted", "hosted events with total, received and due"),
      e("GET", "/admin/tournaments/:id/billing", "the bill: court hours, goods, charges, discounts, payments"), e("POST", "/admin/tournaments/:id/items", "take goods from the shop onto the bill"),
      e("POST", "/admin/tournaments/:id/lines", "extra charge or discount"), e("POST", "/admin/tournaments/:id/payments", "receive cash and/or Fonepay"), e("POST", "/admin/tournaments/:id/final-bill", "make the final bill (reopen-bill undoes it)"),
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
    slug: "notifications", title: "Notifications", group: "Communication", icon: "megaphone",
    summary: "Bell notices, Web Push and SMS.",
    clientFeatures: ["Typed notices drive the Popular tile badges", "Web Push (needs VAPID keys)", "Promo and SMS preferences"],
    adminTasks: ["Send promo / tournament / general notices to all customers, team captains or one customer", "See how many it reaches before sending, and how many opened it after", "Send SMS (not built)", "Respect customer preferences (promo opt-outs are skipped)"],
    endpoints: [
      e("POST", "/admin/notifications/broadcast", "promo / tournament / general notice to all, captains or one customer"),
      e("GET", "/admin/notifications/reach", "how many customers a notice would reach"),
      e("GET", "/admin/notifications/history", "sent notices with opened counts"),
      e("POST", "/admin/notifications/sms", "SMS", "needed"),
    ],
  },
  {
    slug: "complaints", title: "Complaints", group: "Communication", icon: "alert",
    summary: "What customers report from the app, with photos, and your replies.",
    clientFeatures: ["Popular > Complaints", "Category, message, optional booking code and up to 3 photos", "Status and the venue's reply shown to the customer", "5 complaints per customer per day"],
    adminTasks: ["See every complaint by status, category, name, phone or code", "View the photos", "Reply and change the status (the customer is notified)", "Call the customer"],
    endpoints: [
      e("GET", "/admin/complaints", "list, filters, search"), e("GET", "/admin/complaints/counts", "counts per status"),
      e("GET", "/admin/complaints/:id", "one complaint"), e("PATCH", "/admin/complaints/:id", "status and reply, notifies the customer"),
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
    slug: "academy", title: "Children's Academy", group: "Communication", icon: "graduation",
    summary: "Football classes for children aged 10 to 14: you set the times, guardians confirm.",
    clientFeatures: ["Popular > Children's Academy", "Guardian name, contact and emergency number, address", "Child name, age (10 to 14) and health status", "Pick a class time you made visible", "Accept your Terms and Conditions", "Cancel until the class starts"],
    adminTasks: ["Add class times (repeat weekly) and choose when guardians can see them", "See who is enrolled with guardian, emergency contact and health notes", "Call the guardian or emergency contact", "Mark attended or no-show", "Cancel a class (guardians are told)", "Edit the Terms and Conditions (new version each time)"],
    endpoints: [
      e("GET", "/admin/academy/overview", "counts"), e("GET", "/admin/academy/sessions", "classes, upcoming or past"),
      e("POST", "/admin/academy/sessions", "add (optionally repeat weekly)"), e("PATCH", "/admin/academy/sessions/:id", "edit, show or hide"),
      e("POST", "/admin/academy/sessions/:id/cancel", "cancel and tell guardians"), e("GET", "/admin/academy/enrollments", "enrolled children, filters"),
      e("POST", "/admin/academy/enrollments/:id/attendance", "attended or no-show"), e("POST", "/admin/academy/enrollments/:id/cancel", "cancel one enrolment"),
      e("GET", "/admin/academy/terms", "current terms and history"), e("PUT", "/admin/academy/terms", "save a new version"),
    ],
  },
  {
    slug: "content", title: "Site Content", group: "Communication", icon: "image",
    summary: "Gallery photos and ads: header, footer, in-page and pop-up, looping and time-targeted.",
    clientFeatures: ["Gallery on Home (landscape and portrait)", "Header, footer and in-page ad banners that loop", "Pop-up ads with a delay and a frequency", "Ads that run only at set hours, dates or weekdays"],
    adminTasks: ["Upload gallery photos, rename, reorder, hide or delete", "Add ads with a picture, link, place and seconds per ad", "Target an ad by hours (for example 6:00 to 7:00 AM for one hour), dates and weekdays", "Pause, edit or delete an ad", "See views and clicks"],
    endpoints: [
      e("GET", "/admin/content/overview", "photos, live ads, views, clicks"), e("GET", "/admin/content/gallery", "all photos"),
      e("POST", "/admin/content/gallery", "upload a photo"), e("PATCH", "/admin/content/gallery/:id", "title, caption, show or hide"),
      e("POST", "/admin/content/gallery/reorder", "save the order"), e("DELETE", "/admin/content/gallery/:id", "delete a photo"),
      e("GET", "/admin/content/ads", "all ads with live status"), e("POST", "/admin/content/ads", "add an ad"),
      e("PATCH", "/admin/content/ads/:id", "edit, pause, replace the picture"), e("DELETE", "/admin/content/ads/:id", "delete an ad"),
    ],
  },
  {
    slug: "inventory", title: "Inventory & Goods", group: "Business", icon: "box",
    summary: "Products sold at the venue: stock, restocking, counter sales and goods points.",
    clientFeatures: ["Goods points: Rs. 100 = 1 point, kept for a year", "Bottled water is taken from stock when a booking is paid"],
    adminTasks: ["Add categories and products with price, cost and a low-stock warning", "Restock, remove or count stock, every change is logged", "Sell goods at the counter (cash or online), optionally to a registered customer for points", "See sales and the stock log"],
    endpoints: [
      e("GET", "/admin/inventory/overview", "counts, stock value, sales today and this week"), e("GET", "/admin/inventory/categories", "categories"),
      e("POST", "/admin/inventory/categories", "add (also PATCH, DELETE)"), e("GET", "/admin/inventory/products", "search, category, low or out of stock"),
      e("POST", "/admin/inventory/products", "add with opening stock (also PATCH, DELETE)"), e("POST", "/admin/inventory/products/:id/stock", "add, remove or count"),
      e("GET", "/admin/inventory/logs", "stock log"), e("GET", "/admin/inventory/customer-bill", "a customer's games and what they owe"), e("POST", "/admin/inventory/checkout", "final bill: goods and games, points, saved for the customer"), e("GET", "/admin/inventory/bills", "customer bills"), e("POST", "/admin/inventory/sales", "counter sale, takes stock, gives points"), e("GET", "/admin/inventory/sales", "sales list"),
    ],
  },
  {
    slug: "expenses", title: "Expenses", group: "Business", icon: "receipt",
    summary: "Venue expenses and summaries.",
    clientFeatures: [],
    adminTasks: ["Record and edit expenses", "Category summary"],
    endpoints: [
      e("GET", "/admin/expenses", "list", "needed"),
      e("POST", "/admin/expenses", "create", "needed"),
    ],
  },
  {
    slug: "reports", title: "Reports", group: "Business", icon: "chart",
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
    slug: "staff", title: "Staff & Roles", group: "System", icon: "key",
    summary: "Who may use the portal and what they may do.",
    clientFeatures: [],
    adminTasks: ["Owner only: add admin accounts (everything except accounts) and staff accounts (only what you tick)", "Tick small permissions for each staff member, one per action", "Disable an account or reset a password"],
    endpoints: [
      e("GET", "/admin/staff", "all accounts with what each can do"), e("GET", "/admin/staff/catalog", "the permission sections with their tick boxes, and quick-start presets"),
      e("POST", "/admin/staff", "create an admin or staff account"), e("PATCH", "/admin/staff/:id", "change access, disable, reset password"),
    ],
  },
  {
    slug: "audit", title: "Audit Log", group: "System", icon: "list",
    summary: "Who changed what and when.",
    clientFeatures: [],
    adminTasks: ["Search a name, record code, phone or any word in the details", "Filter by staff, what changed, action and date (Today, Yesterday, custom)", "Open an entry to see what was saved", "Download the filtered log"],
    endpoints: [
      e("GET", "/admin/audit", "filter by entity, action, staff, record id, from / to dates and search text"),
      e("GET", "/admin/audit/filters", "staff, entities and actions with counts, and today / 7 days / all-time totals"),
    ],
  },
  {
    slug: "settings", title: "Settings", group: "System", icon: "settings",
    summary: "Venue settings and integrations.",
    clientFeatures: ["Footer, Help page and the Call / WhatsApp buttons show the venue details", "Venue Wi-Fi", "Advance deposit when booking"],
    adminTasks: ["Edit venue name, phone, WhatsApp, email, address, social links and map", "Venue Wi-Fi name and password", "Booking advance deposit", "See Fonepay (test or live), push and database status", "Change my password"],
    endpoints: [
      e("GET", "/admin/settings", "venue details, Wi-Fi, deposit and integration status (no secrets)"),
      e("PUT", "/admin/settings/venue", "save venue details"), e("PUT", "/admin/settings/wifi", "save Wi-Fi"), e("PUT", "/admin/settings/booking", "save the advance deposit"),
    ],
  },
];

export const groups = ["Operations", "Customers", "Community", "Gamezone", "Communication", "Business", "System"];

export const findModule = (slug: string) => modules.find((m) => m.slug === slug);
