import { app } from "./app";
import env from "./config/env";

app.listen(env.PORT, () => console.log(`Admin API on http://localhost:${env.PORT}/api (${env.NODE_ENV})`));
