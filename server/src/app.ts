import cors from "cors";
import express, { ErrorRequestHandler } from "express";
import helmet from "helmet";
import env from "./config/env";
import { AppError } from "./lib/http";
import { requireStaff } from "./middleware/auth";
import { arrivalsRouter } from "./modules/arrivals";
import { authRouter } from "./modules/auth";
import { bookingsRouter } from "./modules/bookings";
import { complaintsRouter } from "./modules/complaints";
import { courtsRouter } from "./modules/courts";
import { customersRouter } from "./modules/customers";
import { gamezoneRouter } from "./modules/gamezone";
import { loyaltyRouter } from "./modules/loyalty";
import { membershipPlansRouter } from "./modules/membership-plans";
import { overviewRouter } from "./modules/overview";
import { paymentsRouter } from "./modules/payments";
import { ledgerRouter } from "./modules/payments-ledger";
import { promosRouter } from "./modules/promos";
import { staffRouter } from "./modules/staff";
import { teamsRouter } from "./modules/teams";

export const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => (!origin || env.ALLOWED_ORIGINS.includes(origin) ? cb(null, true) : cb(new Error("Not allowed by CORS"))),
}));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => { res.json({ success: true, message: "Admin server is running" }); });

const admin = express.Router();
admin.use("/auth", authRouter); // login is the only route without a token
admin.use(requireStaff); // everything below needs a valid staff token; each route then checks its permission
admin.use("/staff", staffRouter);
admin.use("/arrivals", arrivalsRouter);
admin.use("/bookings", bookingsRouter);
admin.use("/payments", ledgerRouter);
admin.use("/payments", paymentsRouter);
admin.use("/customers", customersRouter);
admin.use("/complaints", complaintsRouter);
admin.use("/courts", courtsRouter);
admin.use("/promos", promosRouter);
admin.use("/loyalty", loyaltyRouter);
admin.use("/membership", membershipPlansRouter);
admin.use("/gamezone", gamezoneRouter);
admin.use("/teams", teamsRouter);
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
