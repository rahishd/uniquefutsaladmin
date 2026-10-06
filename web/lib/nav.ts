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
    adminTasks: ["See a whole day at once (booked, completed, open, blocked)", "Tap + to book a customer by hand (walk-in or phone)", "Log a game that already happened", "Reject (cancel) a booking"],
    endpoints: [
      e("GET", "/admin/courts/slots", "all hours of a date with who booked them"), e("POST", "/admin/bookings/walk-in", "manual booking"),
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
    summary: "eSewa / Fonepay QR orders, pay-at-venue and refunds.",
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
    slug: "customers", title: "Customers", group: "Customers", icon: "users",
    summary: "Registered players (phone + password, Google link for reset).",
    clientFeatures: ["Profile, location, position", "Preferences (SMS, promo, pop-up)", "Player / Captain mode", "Booking and payment history", "Gameplay stats"],
    adminTasks: ["Search and open a customer (profile, bookings, points, team)", "Edit details", "Suspend / unsuspend", "Anonymise on request (money records kept)"],
    endpoints: [
      e("GET", "/admin/customers", "list with games, paid, unpaid and open complaints; filter captains / players"),
      e("GET", "/admin/customers/:phone/profile", "games, payments, extra items, complaints, tournaments, captain profile, promo settings"),
      e("PUT", "/admin/customers/:phone/promos", "switch a promo code (or all) on or off for one customer"),
      e("PATCH", "/admin/customers/:phone", "edit name or email"),
      e("POST", "/admin/customers/:phone/suspend", "suspend (and /unsuspend)"),
    ],
  },
  {
    slug: "membership", title: "Membership", group: "Customers", icon: "badge",
    summary: "Monthly / 3 / 6 month plans by shift (Basic, Premium).",
    clientFeatures: ["Offers with discounted prices per shift", "Request a plan (pending until staff verify payment)", "4 PM to 8 PM never offered", "Points for 3 and 6 month plans"],
    adminTasks: ["Plans CRUD and featured plan", "Subscriptions list, verify payment (activates)", "Manual subscription, renew, extend, suspend", "Settlement and invoice"],
    endpoints: [
      e("GET", "/admin/membership/plans", "plans with the shift x 1/3/6 month price matrix"),
      e("POST", "/admin/membership/plans", "create a plan"),
      e("PUT", "/admin/membership/plans/:id", "edit prices, perks, featured, active"),
      e("GET", "/admin/membership/subscriptions", "subscriptions (customer backend has it today)", "needed"),
      e("POST", "/admin/membership/verify-payment", "activate", "needed"),
    ],
  },
  {
    slug: "loyalty", title: "Loyalty Points", group: "Customers", icon: "star",
    summary: "Points ledger, expiry and free-game vouchers.",
    clientFeatures: ["Game points price/100, goods Rs.100 = 1", "Expiry (game 3 months, goods 1 year)", "Claim a free game voucher per shift", "Expiring-soon warnings"],
    adminTasks: ["Record a goods sale (awards points)", "View a customer's ledger and vouchers", "Manual adjustment with reason", "Void a voucher", "Liability report"],
    endpoints: [
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
    adminTasks: ["Create, edit, pause promo codes (dates, discount, eligibility)", "Usage report"],
    endpoints: [
      e("GET", "/admin/promos", "list"),
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
    adminTasks: ["Teams and rosters", "Challenges and results", "Mark challenge game paid at venue (prompts captains)", "Settlement list: who owes what"],
    endpoints: [
      e("GET", "/admin/teams", "all teams"),
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
    adminTasks: ["Create and edit tournaments", "Registrations", "Edit rounds and matches, live scores", "Notify customers"],
    endpoints: [
      e("GET", "/admin/tournaments", "list (customer backend has it today)", "needed"),
      e("PUT", "/admin/tournaments/:id/tiesheet", "tie-sheet", "needed"),
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
    adminTasks: ["Broadcast promo / tournament notices", "Send SMS", "Respect customer preferences"],
    endpoints: [
      e("POST", "/admin/notifications/broadcast", "promo / tournament / general notice"),
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
    slug: "content", title: "Site Content", group: "Communication", icon: "image",
    summary: "Ads, gallery, contact info and help content.",
    clientFeatures: ["Home banner and ads", "Gallery", "Contact, map, WhatsApp number", "Help topics"],
    adminTasks: ["Ads and gallery CRUD", "Edit contact details", "Venue Wi-Fi"],
    endpoints: [
      e("GET", "/admin/content/ads", "ads", "needed"),
      e("GET", "/admin/content/gallery", "gallery", "needed"),
      e("PATCH", "/admin/content/site", "contact details", "needed"),
    ],
  },
  {
    slug: "inventory", title: "Inventory & Goods", group: "Business", icon: "box",
    summary: "Products sold at the venue (goods earn points).",
    clientFeatures: ["Goods points: Rs.100 = 1 point"],
    adminTasks: ["Products and categories", "Stock adjustments and logs", "Sell goods to a customer"],
    endpoints: [
      e("GET", "/admin/inventory/products", "products", "needed"),
      e("PATCH", "/admin/inventory/products/:id/stock", "stock", "needed"),
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
    adminTasks: ["Revenue by day and method", "Occupancy", "No-shows", "Loyalty liability", "PDF / CSV export"],
    endpoints: [
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
    adminTasks: ["Staff accounts", "Roles: owner, manager, front desk, accountant", "Disable an account"],
    endpoints: [
      e("GET", "/admin/staff", "accounts"),
      e("POST", "/admin/staff", "create (owner)"),
      e("PATCH", "/admin/staff/:id", "role, disable, reset password"),
    ],
  },
  {
    slug: "audit", title: "Audit Log", group: "System", icon: "list",
    summary: "Who changed what and when.",
    clientFeatures: [],
    adminTasks: ["Filter by action, entity, user", "View before / after"],
    endpoints: [
      e("GET", "/admin/audit", "filter by entity, action, staff"),
    ],
  },
  {
    slug: "settings", title: "Settings", group: "System", icon: "settings",
    summary: "Venue settings and integrations.",
    clientFeatures: ["Booking window and rules", "OTP off, test payment gateway until real keys exist"],
    adminTasks: ["Venue settings", "Payment gateway status", "Push and SMS status"],
    endpoints: [
      e("GET", "/admin/settings", "venue settings, Wi-Fi", "needed"),
    ],
  },
];

export const groups = ["Operations", "Customers", "Community", "Gamezone", "Communication", "Business", "System"];

export const findModule = (slug: string) => modules.find((m) => m.slug === slug);
