import cors from "cors";
import express, { ErrorRequestHandler } from "express";
import helmet from "helmet";
import env from "./config/env";
import { AppError } from "./lib/http";
import { requireStaff } from "./middleware/auth";
import { prisma } from "./db";
import { academyRouter } from "./modules/academy";
import { arrivalsRouter } from "./modules/arrivals";
import { authRouter } from "./modules/auth";
import { bookingsRouter } from "./modules/bookings";
import { complaintsRouter } from "./modules/complaints";
import { contentRouter } from "./modules/content";
import { courtsRouter } from "./modules/courts";
import { customersRouter } from "./modules/customers";
import { digitalIdRouter } from "./modules/digital-id";
import { fonepayRouter, fonepayWebhookRouter } from "./modules/fonepay";
import { tournamentsRouter } from "./modules/tournaments";
import { tournamentEventsRouter } from "./modules/tournament-events";
import { tournamentHostRouter } from "./modules/tournament-host";
import { gamezoneRouter } from "./modules/gamezone";
import { inventoryRouter } from "./modules/inventory";
import { loyaltyRouter } from "./modules/loyalty";
import { membershipPlansRouter } from "./modules/membership-plans";
import { inventoryReportRouter } from "./modules/inventory-report";
import { settingsPageRouter } from "./modules/settings-page";
import { activityRouter } from "./modules/activity";
import { reportsSummaryRouter } from "./modules/reports-summary";
import { membershipSubsRouter } from "./modules/membership-subs";
import { overviewRouter } from "./modules/overview";
import { paymentsRouter } from "./modules/payments";
import { ledgerRouter } from "./modules/payments-ledger";
import { referRouter } from "./modules/refer";
import { promosRouter } from "./modules/promos";
import { staffRouter } from "./modules/staff";
import { teamsRouter } from "./modules/teams";
import { vipRouter } from "./modules/vip";

export const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => (!origin || env.ALLOWED_ORIGINS.includes(origin) ? cb(null, true) : cb(new Error("Not allowed by CORS"))),
}));
// Site Content takes pictures (big bodies); its own router reads them, after the staff sign-in check
const smallJson = express.json({ limit: "100kb" });
app.use((req, res, next) => (req.path.startsWith("/api/admin/content") ? next() : smallJson(req, res, next)));

app.get("/api/health", (_req, res) => { res.json({ success: true, message: "Admin server is running" }); });

const admin = express.Router();
admin.use("/auth", authRouter); // login is the only route without a token
admin.use("/fonepay/webhook", fonepayWebhookRouter); // the gateway's callback: no staff token, checked by the provider's signature
admin.use("/host", tournamentHostRouter); // match-day host link: no staff token, the secret in the link opens one tournament
// Pictures for the previews in this portal. They are public anyway (the customer app shows them), and an <img> tag cannot send a token.
admin.get("/media/:id", async (req, res, next) => {
  try {
    const m = await prisma.contentMedia.findUnique({ where: { id: String(req.params.id) } });
    if (!m) return next(new AppError(404, "Not found"));
    res.set({ "Content-Type": m.mime, "Cache-Control": "public, max-age=31536000, immutable", "Cross-Origin-Resource-Policy": "cross-origin" });
    res.send(Buffer.from(m.data));
  } catch (e) { next(e); }
});
admin.use(requireStaff); // everything below needs a valid staff token; each route then checks its permission
admin.use("/staff", staffRouter);
admin.use("/arrivals", arrivalsRouter);
admin.use("/bookings", bookingsRouter);
admin.use("/payments", ledgerRouter);
admin.use("/payments", paymentsRouter);
admin.use("/customers", customersRouter);
admin.use("/digital-id", digitalIdRouter);
admin.use("/complaints", complaintsRouter);
admin.use("/academy", academyRouter);
admin.use("/refer", referRouter);
admin.use("/content", contentRouter);
admin.use("/inventory", inventoryRouter);
admin.use("/fonepay", fonepayRouter);
admin.use("/courts", courtsRouter);
admin.use("/promos", promosRouter);
admin.use("/loyalty", loyaltyRouter);
admin.use("/membership", membershipPlansRouter);
admin.use("/membership", membershipSubsRouter);
admin.use("/reports", reportsSummaryRouter);
admin.use("/", activityRouter);
admin.use("/settings", settingsPageRouter);
admin.use("/inventory", inventoryReportRouter);
admin.use("/gamezone", gamezoneRouter);
admin.use("/teams", teamsRouter);
admin.use("/tournaments", tournamentEventsRouter); // hosted events first, so /hosted is not read as an id
admin.use("/tournaments", tournamentsRouter);
admin.use("/vip", vipRouter);
admin.use("/", overviewRouter);
app.use("/api/admin", admin);

app.use((_req, _res, next) => next(new AppError(404, "Not found")));

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof AppError ? err.status : err?.message === "Not allowed by CORS" ? 403 : 500;
  if (status === 500) console.error(err);
  // Never leak internals: unexpected errors get a generic message.
  res.status(status).json({ success: false, statusCode: status, message: status === 500 ? "Something went wrong" : err.message });
};
app.use(onError);
