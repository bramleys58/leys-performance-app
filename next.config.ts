import type { NextConfig } from "next";

// Every screen in this app is personal and behind a login, so pages are
// rendered per request. Cache Components is left off on purpose.
const nextConfig: NextConfig = {
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
