import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  HOST: z.string().default("0.0.0.0"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  DEMO_FLEET_TICKER: z.enum(["true", "false"]).optional(),
  SIMULATION_CREDENTIAL_SECRET: z
    .string()
    .min(32)
    .default("development-simulation-secret-change-me"),
});

export const config = schema.parse(process.env);
