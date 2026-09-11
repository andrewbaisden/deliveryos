import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const rootEnv = path.join(__dirname, "../../.env");
const localEnv = path.join(__dirname, ".env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

const nextConfig: NextConfig = {
  transpilePackages: [
    "@deliveryos/contracts",
    "@deliveryos/domain",
    "@deliveryos/database",
    "@deliveryos/providers",
  ],
  serverExternalPackages: ["bullmq", "ioredis"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://api.mapbox.com; connect-src 'self' https://api.mapbox.com https://events.mapbox.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
      {
        source: "/track/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
