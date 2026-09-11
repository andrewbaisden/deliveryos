import { database } from "@deliveryos/database/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { serverEnv } from "./env";

if (!database) {
  throw new Error(
    "DATABASE_URL is required. Copy .env.example to the repo root .env and restart the web app.",
  );
}

export const auth = betterAuth({
  database: prismaAdapter(database, { provider: "postgresql" }),
  advanced: { database: { generateId: false } },
  secret: serverEnv.BETTER_AUTH_SECRET,
  baseURL: serverEnv.BETTER_AUTH_URL,
  emailAndPassword: { enabled: true, disableSignUp: true },
});
