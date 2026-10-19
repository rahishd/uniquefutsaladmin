import { app } from "./app";
import env from "./config/env";
import { startStaffPushWatcher } from "./modules/staff-push";

app.listen(env.PORT, () => console.log(`Admin API on http://localhost:${env.PORT}/api (${env.NODE_ENV})`));
startStaffPushWatcher(); // alerts to staff devices while the portal is closed
