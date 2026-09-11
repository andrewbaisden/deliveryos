import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client";

const globalDatabase = globalThis as unknown as {
  deliveryOsPrisma?: PrismaClient;
};

export function createDatabase(
  connectionString = process.env.DATABASE_URL,
): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const database =
  globalDatabase.deliveryOsPrisma ??
  (process.env.DATABASE_URL
    ? createDatabase(process.env.DATABASE_URL)
    : undefined);

if (process.env.NODE_ENV !== "production" && database)
  globalDatabase.deliveryOsPrisma = database;
