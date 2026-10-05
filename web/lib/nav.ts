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
    slug: "bookings", title: "Bookings", group: "Operations", icon: "calendar",
    summary: "Court bookings made in the app (online, pay at venue, free-game voucher, guest).",
    clientFeatures: ["Slots up to 10 days ahead", "Quote, promo and voucher at checkout", "Guest vs registered rules", "10 minute QR hold", "Free cancellation until start", "Quick Rebook", "Short booking code (UF-XXXXXX)"],
    adminTasks: ["Day view and list with filters (date, status, code, phone)", "Walk-in booking", "Cancel, complete (awards points), no-show", "Upload invoice", "Record player goals and assists"],
    endpoints: [
      e("GET", "/bookings", "all bookings (staff)"), e("PATCH", "/bookings/:id", "update status/payment"), e("POST", "/bookings/:id/cancel", "soft cancel"),
      e("PUT", "/bookings/:id/player-stats", "goals / assists"), e("POST", "/bookings/:id/invoice", "invoice upload"),
      e("POST", "/admin/bookings", "walk-in booking", "needed"), e("POST", "/admin/bookings/:code/complete", "complete + loyalty", "needed"), e("POST", "/admin/bookings/:code/no-show", "mark no-show", "needed"),
    ],
  },
  {
    slug: "arrivals", title: "Arrivals", group: "Operations", icon: "bell",
    summary: "\"I'm coming\" check-ins sent by customers from 1 hour before kickoff.",
    clientFeatures: ["Full-screen \"I'm coming\" slider", "Pop-up reminder setting", "Check-in window: 1h before to 30 min after"],
    adminTasks: ["Live list of customers on the way (court and Gamezone)", "Badge or sound for new check-ins"],
    endpoints: [e("GET", "/bookings/arrivals", "who is on the way")],
  },
  {
    slug: "payments", title: "Payments", group: "Operations", icon: "wallet",
    summary: "eSewa / Fonepay QR orders, pay-at-venue and refunds.",
    clientFeatures: ["QR with remarks, valid 10 minutes", "Status polling (paid is never trusted from the browser)", "Pay at venue (registered only)", "Free cancel creates a refund due"],
    adminTasks: ["Mark venue payments paid", "Refund queue (REFUND_DUE events)", "Reconciliation list", "Failed or expired orders and gateway callbacks"],
    endpoints: [
      e("POST", "/payments/:orderCode/mark-paid", "venue payment"), e("GET", "/payments/:orderCode/status", "status"),
      e("GET", "/admin/payments", "reconciliation list", "needed"), e("POST", "/admin/payments/:orderCode/refund", "record refund", "needed"),
    ],
  },
  {
    slug: "courts", title: "Courts & Pricing", group: "Operations", icon: "grid",
    summary: "Hourly prices per shift and blocked slots.",
    clientFeatures: ["Morning / Day / Evening prices", "Free hours listed per date", "One pool of hours (court count undecided)"],
    adminTasks: ["Edit price per shift and hour", "Block slots for maintenance or events", "View slot occupancy"],
    endpoints: [e("GET", "/settings", "pricing lives in Settings today"), e("PATCH", "/settings", "update settings"), e("POST", "/admin/slot-blocks", "block a slot", "needed")],
  },
  {
    slug: "customers", title: "Customers", group: "Customers", icon: "users",
    summary: "Registered players (phone + password, Google link for reset).",
    clientFeatures: ["Profile, location, position", "Preferences (SMS, promo, pop-up)", "Player / Captain mode", "Booking and payment history", "Gameplay stats"],
    adminTasks: ["Search and open a customer (profile, bookings, points, team)", "Edit details", "Suspend / unsuspend", "Anonymise on request (money records kept)"],
    endpoints: [
      e("GET", "/users/search", "search"), e("GET", "/users/players", "list"), e("GET", "/users/players/:phone/bookings", "history"), e("PATCH", "/users/:phone", "edit"),
      e("POST", "/admin/customers/:id/suspend", "suspend", "needed"),
    ],
  },
  {
    slug: "membership", title: "Membership", group: "Customers", icon: "badge",
    summary: "Monthly / 3 / 6 month plans by shift (Basic, Premium).",
    clientFeatures: ["Offers with discounted prices per shift", "Request a plan (pending until staff verify payment)", "4 PM to 8 PM never offered", "Points for 3 and 6 month plans"],
    adminTasks: ["Plans CRUD and featured plan", "Subscriptions list, verify payment (activates)", "Manual subscription, renew, extend, suspend", "Settlement and invoice"],
    endpoints: [
      e("GET", "/membership/plans", "plans"), e("POST", "/membership/plans", "create plan"), e("PATCH", "/membership/plans/:id", "edit plan"),
      e("GET", "/membership/subscriptions", "all subscriptions"), e("POST", "/membership/subscriptions/verify-payment", "activate"),
      e("POST", "/membership/subscriptions/manual", "manual create"), e("POST", "/membership/subscriptions/:id/renew", "renew"),
    ],
  },
  {
    slug: "loyalty", title: "Loyalty Points", group: "Customers", icon: "star",
    summary: "Points ledger, expiry and free-game vouchers.",
    clientFeatures: ["Game points price/100, goods Rs.100 = 1", "Expiry (game 3 months, goods 1 year)", "Claim a free game voucher per shift", "Expiring-soon warnings"],
    adminTasks: ["Record a goods sale (awards points)", "View a customer's ledger and vouchers", "Manual adjustment with reason", "Void a voucher", "Liability report"],
    endpoints: [e("POST", "/loyalty/goods-sale", "record goods sale"), e("POST", "/admin/loyalty/adjust", "manual adjust", "needed"), e("POST", "/admin/vouchers/:id/void", "void voucher", "needed")],
  },
  {
    slug: "promos", title: "Promo Codes", group: "Customers", icon: "tag",
    summary: "Codes shown on Home and the Promos page, validated at booking.",
    clientFeatures: ["Active / Upcoming / Expired tabs", "Copy code", "Ends in N days", "Server-side validation"],
    adminTasks: ["Create, edit, pause promo codes (dates, discount, eligibility)", "Usage report"],
    endpoints: [e("GET", "/promos", "public list (reads Settings)"), e("POST", "/admin/promos", "CRUD promo codes", "needed"), e("GET", "/admin/promos/usage", "usage report", "needed")],
  },
  {
    slug: "teams", title: "Teams & Challenges", group: "Community", icon: "shield",
    summary: "Captain mode: teams (max 12), challenges, results and ratings.",
    clientFeatures: ["Create team, roster by phone", "Challenge with loser pays 70 / 60 / 100%", "Winning captain uploads score, other approves", "Team rating, ranking, form", "\"Did you win?\" prompt"],
    adminTasks: ["Teams and rosters", "Challenges and results", "Mark challenge game paid at venue (prompts captains)", "Settlement list: who owes what"],
    endpoints: [
      e("GET", "/teams/admin/settlements", "who owes what"), e("POST", "/teams/admin/challenges/:id/venue-paid", "mark paid"),
      e("GET", "/teams/ranking", "ranking"), e("GET", "/admin/teams", "all teams", "needed"),
    ],
  },
  {
    slug: "disputes", title: "Disputed Results", group: "Community", icon: "scale",
    summary: "Scores the other captain disputed.",
    clientFeatures: ["Approve or dispute a score", "Disputed results change no records until resolved"],
    adminTasks: ["Review both scores side by side", "Approve, override or void with a note"],
    endpoints: [e("POST", "/teams/admin/results/:id/resolve", "approve / void"), e("GET", "/admin/results?status=disputed", "list disputes", "needed")],
  },
  {
    slug: "tournaments", title: "Tournaments", group: "Community", icon: "trophy",
    summary: "Tournaments, registrations and the tie-sheet shown in the app.",
    clientFeatures: ["Current tournament and tie-sheet", "Tournament Popular tile and notices"],
    adminTasks: ["Create and edit tournaments", "Registrations", "Edit rounds and matches, live scores", "Notify customers"],
    endpoints: [e("GET", "/tournaments", "list"), e("PUT", "/tournaments/:id/tiesheet", "replace tie-sheet"), e("GET", "/tournaments/current", "current")],
  },
  {
    slug: "gamezone", title: "Gamezone (PS5)", group: "Gamezone", icon: "gamepad",
    summary: "PS5 sessions per console, game and player count.",
    clientFeatures: ["Pick console then game", "Solo 300 / 2 players 200 / 4 players 150 per hour each", "1 to 4 hours, 10 AM to 10 PM", "Pay at venue or online"],
    adminTasks: ["Bookings and mark paid", "Manage consoles, games and plans (rates)", "Gamezone invoices"],
    endpoints: [
      e("GET", "/gamezone/admin/bookings", "bookings"), e("POST", "/gamezone/admin/bookings/:code/mark-paid", "mark paid"),
      e("POST", "/gamezone/admin/games", "games"), e("POST", "/gamezone/admin/consoles", "consoles"), e("POST", "/gamezone/admin/plans", "plans"),
    ],
  },
  {
    slug: "notifications", title: "Notifications", group: "Communication", icon: "megaphone",
    summary: "Bell notices, Web Push and SMS.",
    clientFeatures: ["Typed notices drive the Popular tile badges", "Web Push (needs VAPID keys)", "Promo and SMS preferences"],
    adminTasks: ["Broadcast promo / tournament notices", "Send SMS", "Respect customer preferences"],
    endpoints: [e("POST", "/notifications/send-sms", "SMS"), e("POST", "/admin/notifications/broadcast", "broadcast notice + push", "needed")],
  },
  {
    slug: "content", title: "Site Content", group: "Communication", icon: "image",
    summary: "Ads, gallery, contact info and help content.",
    clientFeatures: ["Home banner and ads", "Gallery", "Contact, map, WhatsApp number", "Help topics"],
    adminTasks: ["Ads and gallery CRUD", "Edit contact details", "Venue Wi-Fi"],
    endpoints: [e("GET", "/ads", "ads"), e("GET", "/gallery", "gallery"), e("PATCH", "/site", "contact details"), e("PATCH", "/settings", "settings")],
  },
  {
    slug: "inventory", title: "Inventory & Goods", group: "Business", icon: "box",
    summary: "Products sold at the venue (goods earn points).",
    clientFeatures: ["Goods points: Rs.100 = 1 point"],
    adminTasks: ["Products and categories", "Stock adjustments and logs", "Sell goods to a customer"],
    endpoints: [e("GET", "/products", "products"), e("PATCH", "/products/:id/stock", "stock"), e("GET", "/products/logs", "inventory log"), e("GET", "/categories", "categories")],
  },
  {
    slug: "expenses", title: "Expenses", group: "Business", icon: "receipt",
    summary: "Venue expenses and summaries.",
    clientFeatures: [],
    adminTasks: ["Record and edit expenses", "Category summary"],
    endpoints: [e("GET", "/expenses", "list"), e("GET", "/expenses/summary", "summary"), e("POST", "/expenses", "create")],
  },
  {
    slug: "reports", title: "Reports", group: "Business", icon: "chart",
    summary: "Revenue, occupancy, no-shows and loyalty liability.",
    clientFeatures: ["Price, promo and loyalty rules live on the server"],
    adminTasks: ["Revenue by day and method", "Occupancy", "No-shows", "Loyalty liability", "PDF / CSV export"],
    endpoints: [e("GET", "/analytics/page-visits", "visits"), e("POST", "/analytics/daily-report/upload", "daily report"), e("GET", "/admin/reports/revenue", "revenue", "needed")],
  },
  {
    slug: "staff", title: "Staff & Roles", group: "System", icon: "key",
    summary: "Who may use the portal and what they may do.",
    clientFeatures: [],
    adminTasks: ["Staff accounts", "Roles: owner, manager, front desk, accountant", "Disable an account"],
    endpoints: [e("POST", "/admin/login", "superadmin login (only one role today)"), e("GET", "/admin/staff", "staff accounts and roles", "needed")],
  },
  {
    slug: "audit", title: "Audit Log", group: "System", icon: "list",
    summary: "Who changed what and when.",
    clientFeatures: [],
    adminTasks: ["Filter by action, entity, user", "View before / after"],
    endpoints: [e("GET", "/audit", "log"), e("GET", "/audit/filters", "filter values")],
  },
  {
    slug: "settings", title: "Settings", group: "System", icon: "settings",
    summary: "Venue settings and integrations.",
    clientFeatures: ["Booking window and rules", "OTP off, test payment gateway until real keys exist"],
    adminTasks: ["Venue settings", "Payment gateway status", "Push and SMS status"],
    endpoints: [e("GET", "/settings", "settings"), e("PATCH", "/settings", "update")],
  },
];

export const groups = ["Operations", "Customers", "Community", "Gamezone", "Communication", "Business", "System"];

export const findModule = (slug: string) => modules.find((m) => m.slug === slug);
