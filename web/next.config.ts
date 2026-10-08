import type { NextConfig } from "next";

// In production the admin portal is served at https://uniquefutsal.com/adminofuniquefutsal (the customer site owns the root).
// NEXT_PUBLIC_BASE_PATH is read when you BUILD, so set it in web/.env.production before `npm run build`.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
