import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    memoryEntry: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));
vi.mock("@config/procedural-memory", () => ({
  proceduralMemory: [
    { id: "regra-1", content: "Regra número um.", category: "data" },
    { id: "regra-2", content: "Regra número dois." },
  ],
}));
vi.mock("@config/episodic-seed", () => ({
  episodicSeed: [
    {
      id: "exemplo-1",
      category: "breaking",
      situation: "Lançamento com preço menor.",
      example: "Carrossel-ouro completo do exemplo 1.",
    },
    {
      id: "exemplo-2",
      situation: "Pesquisa com estatística marcante.",
      example: "Carrossel-ouro completo do exemplo 2.",
    },
  ],
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import {
  recallMemory,
  buildRejectedLessonContent,
  deactivateRejectedLessons,
  recordApprovedExample,
  recordRejectedLesson,
  syncManualEpisodic,
  syncManualMemory,
  listMemoryEntries,
  setMemoryEntryActive,
} from "@/services/memory/memory-store";
import type { EmbeddingProvider } from "@/services/embedding";
import type { DraftDetail } from "@/services/storage/draft-store";

const count = vi.mocked(prisma.memoryEntry.count);
const findUnique = vi.mocked(prisma.memoryEntry.findUnique);
const queryRaw = vi.mocked(prisma.$queryRaw);
const executeRaw = vi.mocked(prisma.$executeRaw);

function fakeEmbedder(vector: number[] = [0.1, 0.2, 0.3]): EmbeddingProvider & {
  embed: ReturnType<typeof vi.fn>;
} {
  return { id: "fake-embed", embed: vi.fn().mockResolvedValue([vector]) };
}

function detail(): DraftDetail {
  return {
    draft: {
      id: "d1",
      status: "PENDING",
      shortTitle: "Modelo de IA reduz custo em 40%",
      caption: "Legenda. Fonte: Portal X",
      hashtags: [],
      slides: [{ lead: "O resultado", body: "Um parágrafo qualquer." }],
      newsItemId: "n1",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    source: "Portal X",
    imageUrl: null,
    publishedAt: new Date("2026-07-05T00:00:00Z"),
  };
}

describe("recallMemory (pgvector — DEC-021)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sem candidatos (count 0), devolve [] sem chamar o embedder", async () => {
    count.mockResolvedValue(0);
    const embedder = fakeEmbedder();

    const result = await recallMemory(embedder, "consulta", {
      kind: "PROCEDURAL",
      topK: 4,
    });

    expect(result).toEqual([]);
    expect(embedder.embed).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("com candidatos, embeda a consulta e devolve o resultado do ranking nativo", async () => {
    count.mockResolvedValue(2);
    const rows = [{ id: "m1", content: "Regra.", category: "data" }];
    queryRaw.mockResolvedValue(rows);
    const embedder = fakeEmbedder();

    const result = await recallMemory(embedder, "consulta", {
      kind: "PROCEDURAL",
      category: "data",
      topK: 4,
    });

    expect(result).toEqual(rows);
    expect(embedder.embed).toHaveBeenCalledWith(["consulta"]);
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it("erro no embedder/query nunca lança — devolve [] (fail-safe)", async () => {
    count.mockResolvedValue(1);
    const embedder = fakeEmbedder();
    embedder.embed.mockRejectedValue(new Error("ollama fora do ar"));

    const result = await recallMemory(embedder, "consulta", {
      kind: "EPISODIC",
      topK: 4,
    });

    expect(result).toEqual([]);
  });

  it("recall EPISODIC filtra pela categoria certa (exemplo-ouro por variante)", async () => {
    count.mockResolvedValue(1);
    const rows = [
      {
        id: "manual-episodic:exemplo-1",
        content: "Carrossel-ouro.",
        category: "breaking",
      },
    ];
    queryRaw.mockResolvedValue(rows);
    const embedder = fakeEmbedder();

    const result = await recallMemory(embedder, "consulta", {
      kind: "EPISODIC",
      category: "breaking",
      topK: 2,
    });

    expect(result).toEqual(rows);
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: "EPISODIC" }),
      }),
    );
  });
});

describe("syncManualEpisodic", () => {
  beforeEach(() => vi.resetAllMocks());

  it("grava (embed + insert) uma entrada nova por exemplo-ouro do seed", async () => {
    findUnique.mockResolvedValue(null);
    const embedder = fakeEmbedder();

    await syncManualEpisodic(embedder);

    expect(embedder.embed).toHaveBeenCalledTimes(2); // 2 exemplos no seed mockado
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it("pula o embed quando o conteúdo já está sincronizado (idempotente)", async () => {
    findUnique.mockResolvedValue({
      content:
        "[SITUAÇÃO: Lançamento com preço menor.]\nCarrossel-ouro completo do exemplo 1.",
    } as never);
    const embedder = fakeEmbedder();

    await syncManualEpisodic(embedder);

    // exemplo-1 já sincronizado (mesmo content) → só exemplo-2 é embedado/gravado
    expect(embedder.embed).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("reembeda quando o conteúdo do seed mudou", async () => {
    findUnique.mockResolvedValue({
      content: "Conteúdo antigo, já mudou.",
    } as never);
    const embedder = fakeEmbedder();

    await syncManualEpisodic(embedder);

    expect(embedder.embed).toHaveBeenCalledTimes(2);
  });

  it("sem vetor (embedder devolve vazio), não grava nada (fail-safe)", async () => {
    findUnique.mockResolvedValue(null);
    const embedder = fakeEmbedder();
    embedder.embed.mockResolvedValue([]);

    await syncManualEpisodic(embedder);

    expect(executeRaw).not.toHaveBeenCalled();
  });
});

describe("syncManualMemory", () => {
  beforeEach(() => vi.resetAllMocks());

  it("grava (embed + insert) uma entrada nova", async () => {
    findUnique.mockResolvedValue(null);
    const embedder = fakeEmbedder();

    await syncManualMemory(embedder);

    expect(embedder.embed).toHaveBeenCalledTimes(2); // 2 seeds
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it("pula o embed quando o conteúdo já está sincronizado (idempotente)", async () => {
    findUnique.mockResolvedValue({ content: "Regra número um." } as never);
    const embedder = fakeEmbedder();

    await syncManualMemory(embedder);

    // regra-1 já sincronizada (mesmo content) → só regra-2 é embedada/gravada
    expect(embedder.embed).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("reembeda quando o conteúdo do seed mudou", async () => {
    findUnique.mockResolvedValue({
      content: "Conteúdo antigo, já mudou.",
    } as never);
    const embedder = fakeEmbedder();

    await syncManualMemory(embedder);

    expect(embedder.embed).toHaveBeenCalledTimes(2);
  });
});

describe("recordApprovedExample / recordRejectedLesson", () => {
  beforeEach(() => vi.resetAllMocks());

  it("grava um exemplo EPISODIC a partir do rascunho aprovado", async () => {
    const embedder = fakeEmbedder();

    await recordApprovedExample(embedder, detail(), "d1");

    expect(embedder.embed).toHaveBeenCalledOnce();
    expect(embedder.embed.mock.calls[0]![0][0]).toContain("EXEMPLO APROVADO");
    expect(executeRaw).toHaveBeenCalledOnce();
  });

  it("grava uma lição PROCEDURAL a partir do rascunho rejeitado", async () => {
    const embedder = fakeEmbedder();

    await recordRejectedLesson(embedder, detail(), "d1");

    expect(embedder.embed).toHaveBeenCalledOnce();
    expect(embedder.embed.mock.calls[0]![0][0]).toContain("LIÇÃO");
    expect(executeRaw).toHaveBeenCalledOnce();
  });

  it("sem vetor (embedder devolve vazio), não grava nada", async () => {
    const embedder = fakeEmbedder();
    embedder.embed.mockResolvedValue([]);

    await recordApprovedExample(embedder, detail(), "d1");

    expect(executeRaw).not.toHaveBeenCalled();
  });
});

describe("UI-10/UI-11 — lição com motivo e desativação", () => {
  beforeEach(() => vi.resetAllMocks());

  it("a lição inclui o rótulo do motivo e a nota do revisor", () => {
    const text = buildRejectedLessonContent(detail(), "data", {
      reason: "copied",
      note: "frases iguais às da matéria",
    });
    expect(text).toContain("Motivo do descarte: Copiou demais da fonte.");
    expect(text).toContain("Detalhe do revisor: frases iguais às da matéria");
    expect(text).not.toContain("Evite repetir este padrão de tom");
  });

  it("sem motivo mantém a lição genérica da v1", () => {
    const text = buildRejectedLessonContent(detail(), "data");
    expect(text).toContain("Evite repetir este padrão de tom/estrutura");
    expect(text).not.toContain("Motivo do descarte");
  });

  it("recordRejectedLesson embeda o texto com o motivo e só insere se ainda REJECTED", async () => {
    const embedder = fakeEmbedder();
    await recordRejectedLesson(embedder, detail(), "d1", { reason: "tone" });
    expect(embedder.embed.mock.calls[0]![0][0]).toContain("Tom errado");
    expect(executeRaw).toHaveBeenCalledOnce();
    const sql = (executeRaw.mock.calls[0]![0] as unknown as string[]).join("?");
    expect(sql).toMatch(/WHERE EXISTS/);
    expect(sql).toMatch(/'REJECTED'/);
  });

  it("deactivateRejectedLessons faz UPDATE (nunca DELETE) e ignora lista vazia", async () => {
    executeRaw.mockResolvedValue(2 as never);
    expect(await deactivateRejectedLessons([])).toBe(0);
    expect(executeRaw).not.toHaveBeenCalled();

    expect(await deactivateRejectedLessons(["d1"])).toBe(2);
    const sql = (executeRaw.mock.calls[0]![0] as unknown as string[]).join("?");
    expect(sql).toMatch(/UPDATE "MemoryEntry" SET "active" = false/);
    expect(sql).toMatch(/FEEDBACK_REJECTED/);
    expect(sql).not.toMatch(/DELETE/i);
  });
});

describe("UI-24 — toggle de memória vence o sync (DEC-025 item 4)", () => {
  beforeEach(() => vi.resetAllMocks());

  function upsertSql(): string {
    const sql = (executeRaw.mock.calls[0]![0] as unknown as string[]).join("?");
    return sql.slice(sql.indexOf("DO UPDATE SET"));
  }

  it("syncManualMemory atualiza conteúdo mas NÃO reescreve active", async () => {
    findUnique.mockResolvedValue({ content: "versão antiga" } as never);
    await syncManualMemory(fakeEmbedder());
    const update = upsertSql();
    expect(update).toMatch(/"content" = EXCLUDED."content"/);
    expect(update).not.toMatch(/"active"/);
  });

  it("syncManualEpisodic também preserva active", async () => {
    findUnique.mockResolvedValue({ content: "versão antiga" } as never);
    await syncManualEpisodic(fakeEmbedder());
    expect(upsertSql()).not.toMatch(/"active"/);
  });

  it("setMemoryEntryActive faz UPDATE e informa se achou", async () => {
    executeRaw.mockResolvedValue(1 as never);
    expect(await setMemoryEntryActive("m1", false)).toBe(true);
    const sql = (executeRaw.mock.calls[0]![0] as unknown as string[]).join("?");
    expect(sql).toMatch(/UPDATE "MemoryEntry" SET "active"/);
    executeRaw.mockResolvedValue(0 as never);
    expect(await setMemoryEntryActive("nope", true)).toBe(false);
  });

  it("listMemoryEntries nunca seleciona a coluna embedding", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
    await listMemoryEntries({ source: "MANUAL", active: true, limit: 10 });
    const sql = (
      vi.mocked(prisma.$queryRaw).mock.calls[0]![0] as unknown as string[]
    ).join("?");
    expect(sql).not.toMatch(/embedding/);
    expect(sql).toMatch(/ORDER BY "createdAt" DESC/);
  });
});
