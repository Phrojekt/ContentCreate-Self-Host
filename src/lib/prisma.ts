import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

/**
 * Client Prisma único (singleton).
 *
 * Prisma 7 exige um driver adapter; PostgreSQL em dev (Docker) e produção via
 * `@prisma/adapter-pg` (DEC-003 — paridade dev/prod). O client é guardado em
 * `globalThis` fora de produção para não abrir múltiplas conexões no hot
 * reload do Next.
 */
const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
