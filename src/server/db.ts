import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set — copy .env.example to .env");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Lazily-created singleton (survives Next.js dev hot reloads). */
export function db(): PrismaClient {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

/** Convert plain objects (which may contain `undefined`) into Prisma JSON input. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
