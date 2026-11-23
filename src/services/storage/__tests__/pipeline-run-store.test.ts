import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pipelineRun: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  finishRun,
  getLastRun,
  listRecentRuns,
  startRun,
} from "@/services/storage/pipeline-run-store";

const run = prisma.pipelineRun;

describe("pipeline-run-store (UI-20)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("startRun cria com o trigger e devolve o id", async () => {
    vi.mocked(run.create).mockResolvedValue({ id: "r1" } as never);
    const at = new Date();
    expect(await startRun("MANUAL", at)).toBe("r1");
    expect(vi.mocked(run.create).mock.calls[0]![0]).toMatchObject({
      data: { trigger: "MANUAL", startedAt: at },
    });
  });

  it("finishRun grava status, funil e erros em JSON", async () => {
    await finishRun("r1", {
      status: "PARTIAL",
      finishedAt: new Date(),
      durationMs: 1200,
      result: {
        collected: 9,
        afterDedup: 8,
        afterFilter: 5,
        afterAlreadyProcessed: 4,
        afterSemantic: 3,
        selected: 2,
        skippedThinContent: 1,
        draftsCreated: 1,
        estimatedCostUsd: 0.02,
        errors: ["LLM falhou"],
      },
    });
    const data = vi.mocked(run.update).mock.calls[0]![0].data as Record<
      string,
      unknown
    >;
    expect(data).toMatchObject({
      status: "PARTIAL",
      collected: 9,
      draftsCreated: 1,
      durationMs: 1200,
      errors: '["LLM falhou"]',
      failure: null,
    });
  });

  it("finishRun sem resultado (FAILED) não zera o funil", async () => {
    await finishRun("r1", {
      status: "FAILED",
      finishedAt: new Date(),
      durationMs: 5,
      failure: "boom",
    });
    const data = vi.mocked(run.update).mock.calls[0]![0].data as Record<
      string,
      unknown
    >;
    expect(data).not.toHaveProperty("collected");
    expect(data.failure).toBe("boom");
  });

  it("lê rodadas convertendo erros e ignora SKIPPED em getLastRun", async () => {
    const row = {
      id: "r1",
      startedAt: new Date(),
      finishedAt: null,
      durationMs: null,
      trigger: "SCHEDULED",
      status: "OK",
      collected: 1,
      afterDedup: 1,
      afterFilter: 1,
      afterAlreadyProcessed: 1,
      afterSemantic: 1,
      selected: 1,
      skippedThinContent: 0,
      draftsCreated: 1,
      estimatedCostUsd: 0,
      errors: "not json",
      failure: null,
      sourceStats:
        '[{"source":"A","collected":2,"selected":1,"fullArticle":1,"summaryOnly":0,"drafts":1,"feedFailed":false},{"bad":1}]',
    };
    vi.mocked(run.findMany).mockResolvedValue([row] as never);
    vi.mocked(run.findFirst).mockResolvedValue(row as never);
    const [rec] = await listRecentRuns();
    expect(rec!.errors).toEqual([]);
    expect(rec!.sourceStats).toHaveLength(1);
    expect(rec!.sourceStats[0]!.source).toBe("A");
    await getLastRun();
    expect(vi.mocked(run.findFirst).mock.calls[0]![0]).toMatchObject({
      where: { status: { not: "SKIPPED" } },
    });
  });
});
