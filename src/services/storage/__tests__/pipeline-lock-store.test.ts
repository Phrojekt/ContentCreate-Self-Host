import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pipelineLock: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  acquirePipelineLock,
  PIPELINE_LOCK_ID,
  PIPELINE_LOCK_STALE_MS,
  releasePipelineLock,
} from "@/services/storage/pipeline-lock-store";

const create = vi.mocked(prisma.pipelineLock.create);
const deleteMany = vi.mocked(prisma.pipelineLock.deleteMany);

/** Erro com o shape de uma violação de unicidade do Prisma (P2002). */
function uniqueViolation(): { code: string } {
  return { code: "P2002" };
}

describe("acquirePipelineLock", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    deleteMany.mockResolvedValue({ count: 0 });
  });

  it("adquire a trava quando não há rodada ativa (create OK)", async () => {
    create.mockResolvedValue({} as never);

    const ok = await acquirePipelineLock("host:1");

    expect(ok).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: PIPELINE_LOCK_ID, holder: "host:1" }),
    });
  });

  it("falha (false) quando já há trava (violação de unicidade P2002)", async () => {
    create.mockRejectedValue(uniqueViolation());

    const ok = await acquirePipelineLock("host:2");

    expect(ok).toBe(false);
  });

  it("repropaga erros que não são violação de unicidade", async () => {
    create.mockRejectedValue(new Error("banco fora do ar"));

    await expect(acquirePipelineLock("host:3")).rejects.toThrow(
      "banco fora do ar",
    );
  });

  it("remove trava órfã (mais velha que o limite) antes de tentar adquirir", async () => {
    create.mockResolvedValue({} as never);
    const now = new Date("2026-06-19T12:00:00Z");

    await acquirePipelineLock("host:4", now);

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: PIPELINE_LOCK_ID,
        lockedAt: { lt: new Date(now.getTime() - PIPELINE_LOCK_STALE_MS) },
      },
    });
    // A limpeza de órfã acontece ANTES do create.
    expect(deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0]!,
    );
  });
});

describe("releasePipelineLock", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    deleteMany.mockResolvedValue({ count: 1 });
  });

  it("libera a trava por id (idempotente via deleteMany)", async () => {
    await releasePipelineLock();

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: PIPELINE_LOCK_ID },
    });
  });
});
