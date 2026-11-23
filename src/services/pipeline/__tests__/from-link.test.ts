import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { extractPageMeta } from "@/services/enrichment/article-body";
import {
  generateDraftFromLink,
  type FromLinkDeps,
} from "@/services/pipeline/from-link";

const BODY = "Texto completo da matéria sobre IA. ".repeat(20);

function deps(over: Partial<FromLinkDeps> = {}) {
  const d = {
    llm: {
      id: "fake",
      summarize: vi.fn().mockResolvedValue({
        shortTitle: "Post gerado",
        caption: "Legenda. Fonte: exame.com",
        hashtags: [],
        quality: { total: 92, breakdown: {}, violations: [], attempts: 1 },
      }),
    },
    extractPage: vi.fn().mockResolvedValue({
      body: BODY,
      title: "Título da matéria",
      imageUrl: "https://exame.com/img.jpg",
    }),
    lock: {
      acquire: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(undefined),
    },
    isProcessed: vi.fn().mockResolvedValue(false),
    saveNewsItem: vi.fn().mockResolvedValue({ id: "n1" }),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    markAsProcessed: vi.fn().mockResolvedValue(undefined),
    now: () => new Date("2026-11-18T12:00:00Z"),
    ...over,
  };
  return d;
}

describe("generateDraftFromLink (UI-33, DEC-026)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lê a página, credita o domínio, gera rascunho e marca processado", async () => {
    const d = deps();
    const res = await generateDraftFromLink(
      "https://www.exame.com/ia/x?utm_source=a",
      d,
    );

    expect(res).toEqual({
      title: "Post gerado",
      source: "exame.com",
      qualityScore: 92,
    });
    const item = vi.mocked(d.llm.summarize).mock.calls[0]![0];
    expect(item).toMatchObject({
      title: "Título da matéria",
      source: "exame.com",
      content: BODY,
      imageUrl: "https://exame.com/img.jpg",
    });
    expect(item.summary.length).toBeLessThanOrEqual(500);
    expect(d.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ newsItemId: "n1" }),
    );
    expect(d.markAsProcessed).toHaveBeenCalledOnce();
    expect(d.lock.release).toHaveBeenCalledOnce();
  });

  it("link não público → 400 sem pegar a trava", async () => {
    const d = deps();
    await expect(
      generateDraftFromLink("http://127.0.0.1/admin", d),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(d.lock.acquire).not.toHaveBeenCalled();
  });

  it("esteira rodando (lock) → 409", async () => {
    const d = deps({
      lock: { acquire: vi.fn().mockResolvedValue(false), release: vi.fn() },
    });
    await expect(
      generateDraftFromLink("https://exame.com/a", d),
    ).rejects.toMatchObject({ statusCode: 409, code: "PIPELINE_BUSY" });
  });

  it("link já processado → 409 e solta a trava", async () => {
    const d = deps({ isProcessed: vi.fn().mockResolvedValue(true) });
    await expect(
      generateDraftFromLink("https://exame.com/a", d),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "LINK_ALREADY_PROCESSED",
    });
    expect(d.extractPage).not.toHaveBeenCalled();
    expect(d.lock.release).toHaveBeenCalledOnce();
  });

  it("página ilegível ou curta demais → 422, sem chamar o LLM", async () => {
    for (const page of [null, { body: "curto", title: null, imageUrl: null }]) {
      const d = deps({ extractPage: vi.fn().mockResolvedValue(page) });
      await expect(
        generateDraftFromLink("https://exame.com/a", d),
      ).rejects.toMatchObject({ statusCode: 422 });
      expect(d.llm.summarize).not.toHaveBeenCalled();
      expect(d.lock.release).toHaveBeenCalled();
    }
  });
});

describe("extractPageMeta", () => {
  it("prefere og:title e lê og:image em qualquer ordem de atributos", () => {
    const html = `<html><head><title>Fallback</title>
      <meta content="Título &amp; OG" property="og:title">
      <meta property="og:image" content="https://x.com/i.png"></head></html>`;
    expect(extractPageMeta(html)).toEqual({
      title: "Título & OG",
      imageUrl: "https://x.com/i.png",
    });
  });

  it("cai no <title> e ignora imagem relativa", () => {
    expect(
      extractPageMeta(
        '<title>  Só   título </title><meta property="og:image" content="/a.png">',
      ),
    ).toEqual({ title: "Só título", imageUrl: null });
  });
});
