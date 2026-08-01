import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Next evaluates every imported module during `next build` while collecting page
// data. Constructing the client at module scope therefore made DATABASE_URL a
// BUILD-time requirement, not just a runtime one — so a deploy failed before it
// ever got as far as running. Build it lazily instead: the error still fires,
// but only when something actually tries to reach the database.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Locally, copy .env.example to .env — the default " +
        "already points at the database `npm run dev` starts for you. When hosting, " +
        "set it in your platform's environment variables.",
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  // Next hot-reloads modules in dev, which would otherwise open a new pool on
  // every edit until Postgres refuses connections.
  if (!globalForPrisma.prisma) {
    const client = createClient();
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
    else return (globalForPrisma.prisma = client);
  }
  return globalForPrisma.prisma;
}

/**
 * Behaves exactly like a PrismaClient, but nothing is constructed until the
 * first property access.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getClient(), prop, receiver);
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
}) as PrismaClient;
