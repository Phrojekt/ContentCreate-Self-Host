import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    draft: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import {
  countDraftsByStatus,
  deleteRejectedDraftRecords,
  getDraftDetail,
  listReviewQueue,
  parseQualityReport,
  saveDraft,
} from "@/services/storage/draft-store";

const findUnique = vi.mocked(prisma.draft.findUnique);

function dbRecord(slidesJson: string) {
  return {
    id: "d1",
    status: "PENDING",
    shortTitle: "Manchete",
    caption: "Legenda. Fonte: Portal X",
    hashtags: "[]",
    slides: slidesJson,
    newsItemId: "n1",
    createdAt: new Date(),
    updatedAt: new Date(),
    newsItem: {
      source: "Portal X",
      imageUrl: null,
      publishedAt: new Date("2026-07-05T00:00:00Z"),
    },
  };
}

describe("getDraftDetail — regressão: arquétipos não podem ser perdidos ao reler do banco", () => {
  beforeEach(() => vi.resetAllMocks());

  it("preserva slideType/stat/comparison/quote salvos, não só lead/body", async () => {
    const slides = [
      {
        slideType: "stat",
        eyebrow: "O NÚMERO",
        lead: "O resultado",
        body: "Contexto.",
        stat: { value: "40%", label: "menos tempo" },
      },
      {
        slideType: "quote",
        lead: "O que disseram",
        body: "Contexto da fala.",
        quote: { text: "Frase real.", author: "Ana Souza", role: "CTO" },
      },
    ];
    findUnique.mockResolvedValue(dbRecord(JSON.stringify(slides)) as never);

    const detail = await getDraftDetail("d1");

    expect(detail?.draft.slides[0]).toMatchObject({
      slideType: "stat",
      eyebrow: "O NÚMERO",
      stat: { value: "40%", label: "menos tempo" },
    });
    expect(detail?.draft.slides[1]).toMatchObject({
      slideType: "quote",
      quote: { text: "Frase real.", author: "Ana Souza", role: "CTO" },
    });
  });

  it("rascunho antigo (só lead/body, sem arquétipo) continua legível", async () => {
    findUnique.mockResolvedValue(
      dbRecord(
        JSON.stringify([{ lead: "Gancho", body: "Parágrafo." }]),
      ) as never,
    );

    const detail = await getDraftDetail("d1");

    expect(detail?.draft.slides[0]).toEqual({
      lead: "Gancho",
      body: "Parágrafo.",
    });
  });
});

describe("listReviewQueue / countDraftsByStatus (UI v2)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("filtra por status e devolve o link da matéria original", async () => {
    vi.mocked(prisma.draft.findMany).mockResolvedValue([
      {
        ...dbRecord("[]"),
        newsItem: {
          source: "Portal X",
          url: "https://portal.x/materia",
          imageUrl: null,
          publishedAt: new Date(),
        },
      },
    ] as never);

    const list = await listReviewQueue({ statuses: ["APPROVED"] });

    expect(vi.mocked(prisma.draft.findMany).mock.calls[0]![0]).toMatchObject({
      where: { status: { in: ["APPROVED"] } },
    });
    expect(list[0]).toMatchObject({
      id: "d1",
      url: "https://portal.x/materia",
    });
  });

  it("sem filtro lista PENDING + APPROVED (compatível com a v1)", async () => {
    vi.mocked(prisma.draft.findMany).mockResolvedValue([] as never);
    await listReviewQueue();
    expect(vi.mocked(prisma.draft.findMany).mock.calls[0]![0]).toMatchObject({
      where: { status: { in: ["PENDING", "APPROVED"] } },
    });
  });

  it("conta por status com zero para os ausentes", async () => {
    vi.mocked(prisma.draft.groupBy).mockResolvedValue([
      { status: "PENDING", _count: { _all: 7 } },
      { status: "REJECTED", _count: { _all: 2 } },
    ] as never);
    expect(await countDraftsByStatus()).toEqual({
      PENDING: 7,
      APPROVED: 0,
      REJECTED: 2,
      PUBLISHED: 0,
    });
  });
});

describe("deleteRejectedDraftRecords (UI-13)", () => {
  beforeEach(() => vi.resetAllMocks());

  function withTx(rows: { id: string; status: string }[]) {
    const tx = {
      draft: {
        findMany: vi.fn().mockResolvedValue(rows),
        deleteMany: vi.fn().mockResolvedValue({ count: rows.length }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(((
      fn: (t: typeof tx) => unknown,
    ) => fn(tx)) as never);
    return tx;
  }

  it("apaga só REJECTED, numa transação", async () => {
    const tx = withTx([
      { id: "a", status: "REJECTED" },
      { id: "b", status: "REJECTED" },
    ]);
    expect(await deleteRejectedDraftRecords(["a", "b"])).toBe(2);
    expect(tx.draft.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] }, status: "REJECTED" },
    });
  });

  it("409 e nada apagado se algum id não for REJECTED ou não existir", async () => {
    const tx = withTx([{ id: "a", status: "PENDING" }]);
    await expect(
      deleteRejectedDraftRecords(["a", "ghost"]),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.draft.deleteMany).not.toHaveBeenCalled();
  });
});

describe("saveDraft — nota de qualidade e rodada (UI-20/UI-21)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("persiste qualityScore, qualityReport e pipelineRunId", async () => {
    await saveDraft({
      newsItemId: "n1",
      pipelineRunId: "run-1",
      output: {
        shortTitle: "T",
        caption: "C",
        hashtags: [],
        quality: {
          total: 87.6,
          breakdown: { language: 20 },
          violations: ["Caption: atribuição ausente"],
          attempts: 2,
        },
      },
    });
    const data = vi.mocked(prisma.draft.create).mock.calls[0]![0]
      .data as Record<string, unknown>;
    expect(data.qualityScore).toBe(88);
    expect(data.pipelineRunId).toBe("run-1");
    expect(JSON.parse(data.qualityReport as string)).toEqual({
      breakdown: { language: 20 },
      violations: ["Caption: atribuição ausente"],
      attempts: 2,
    });
  });

  it("sem quality (provider puro) não grava nota", async () => {
    await saveDraft({
      newsItemId: "n1",
      output: { shortTitle: "T", caption: "C", hashtags: [] },
    });
    const data = vi.mocked(prisma.draft.create).mock.calls[0]![0]
      .data as Record<string, unknown>;
    expect(data).not.toHaveProperty("qualityScore");
    expect(data).not.toHaveProperty("pipelineRunId");
  });

  it("parseQualityReport tolera JSON inválido", () => {
    expect(parseQualityReport("{lixo")).toBeNull();
    expect(parseQualityReport(null)).toBeNull();
    expect(parseQualityReport('{"violations":["a",1]}')).toEqual({
      breakdown: {},
      violations: ["a"],
      attempts: 1,
    });
  });
});
