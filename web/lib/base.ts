// The admin site is served under a path in production (https://uniquefutsal.com/adminofuniquefutsal). The path is set once, at build time,
// by NEXT_PUBLIC_BASE_PATH (see web/.env.production.example). Locally it is empty and the portal is at http://localhost:3100/.
// Next's <Link> and router add it by themselves; use withBase() only for full-page navigation and for links you copy or send to people.
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
export const withBase = (path: string) => `${BASE_PATH}${path}`;
