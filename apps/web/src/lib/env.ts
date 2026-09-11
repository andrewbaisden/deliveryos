import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Next.js loads root env via `envDir`; this covers Vitest and other Node entrypoints.
loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .default("development-only-secret-change-me-now"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  MAPBOX_SECRET_TOKEN: z.string().optional(),
});

export const serverEnv = serverSchema.parse(process.env);
