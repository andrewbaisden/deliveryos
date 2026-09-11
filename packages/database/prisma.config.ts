import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: resolve(import.meta.dirname, "../../../.env") });
loadEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: {
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      "postgresql://deliveryos:deliveryos@localhost:5434/deliveryos",
  },
});
