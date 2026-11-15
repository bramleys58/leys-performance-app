import type { NextConfig } from "next";

// Every screen in this app is personal and behind a login, so pages are
// rendered per request. Cache Components is left off on purpose.
const nextConfig: NextConfig = {
  // The service worker must never be served from an old copy, or phones keep an outdated one.
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
