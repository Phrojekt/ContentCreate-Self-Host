import os from "node:os";

import { prisma } from "@/lib/prisma";

/** Id fixo da trava — garante no máximo 1 linha em `PipelineLock`. */
export const PIPELINE_LOCK_ID = "pipeline";

/**
 * Uma trava mais velha que isto é considerada órfã (rodada que travou/morreu sem
 * liberar) e pode ser tomada. Folga grande sobre a duração típica de uma rodada
 * (~1–10 min com LLM local), para nunca roubar a trava de uma rodada viva.
 */
export const PIPELINE_LOCK_STALE_MS = 30 * 60 * 1000; // 30 min

/** Detecta violação de unicidade do Prisma (P2002) sem acoplar à classe de erro. */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "P2002"
  );
}

/** Identificador legível de quem detém a trava: `host:pid`. */
export function lockHolderId(): string {
  return `${os.hostname()}:${process.pid}`;
}

/**
 * Tenta adquirir a trava global da esteira.
 * - `true`  → adquirida; o chamador DEVE liberar com `releasePipelineLock`.
 * - `false` → já há uma rodada em andamento.
 *
 * Remove uma trava órfã (mais velha que `PIPELINE_LOCK_STALE_MS`) antes de tentar.
 * A atomicidade vem da PK: um segundo `create` com o mesmo id falha (P2002).
 */
export async function acquirePipelineLock(
  holder: string,
  now: Date = new Date(),
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - PIPELINE_LOCK_STALE_MS);
  await prisma.pipelineLock.deleteMany({
    where: { id: PIPELINE_LOCK_ID, lockedAt: { lt: staleBefore } },
  });

  try {
    await prisma.pipelineLock.create({
      data: { id: PIPELINE_LOCK_ID, holder, lockedAt: now },
    });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}

/** Libera a trava global (idempotente — não falha se já estiver livre). */
export async function releasePipelineLock(): Promise<void> {
  await prisma.pipelineLock.deleteMany({ where: { id: PIPELINE_LOCK_ID } });
}
