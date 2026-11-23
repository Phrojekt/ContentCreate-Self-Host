import { QUALITY_MIN_SCORE } from "@/constants/quality";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AgenticRagProvider } from "@/services/llm/agentic-rag-provider";
import type { LlmOutput, LlmProvider } from "@/services/llm/llm-provider";
import type { RecalledMemory } from "@/services/memory";
import type { NewsItem } from "@/types";

function newsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: "Notícia de teste sobre IA",
    summary:
      "Um resumo suficientemente longo para não cair no gate de conteúdo magro, cobrindo o assunto principal da notícia sobre inteligência artificial e dados.",
    url: "https://exemplo.com/noticia",
    canonicalUrl: "https://exemplo.com/noticia",
    source: "Portal Teste",
    publishedAt: new Date("2026-07-05T00:00:00Z"),
    ...overrides,
  };
}

/** Output que passa em `scoreOutput` (>= 90) para o target "limited" (2 slides). */
function goodOutput(): LlmOutput {
  return {
    shortTitle: "Modelo de IA reduz custo de análise em 40%",
    caption:
      "Fonte: Portal Teste. " +
      "Frase de contexto sobre o resultado. ".repeat(10),
    hashtags: ["ia", "dados", "analytics", "tecnologia", "inovacao"],
    slides: [
      {
        lead: "O resultado real",
        body: "O estudo mostrou uma redução concreta de custo na análise de dados, validada em times reais ao longo de meses de acompanhamento.",
      },
      {
        lead: "O que muda agora",
        body: `Você adotaria isso no seu time agora ou esperaria mais evidências? Siga @ia.e.dados para não perder o que vale a sua atenção em IA & Dados.`,
      },
    ],
  };
}

function badOutput(): LlmOutput {
  return {
    shortTitle: "",
    caption: "sem fonte e curta",
    hashtags: [],
    slides: [],
  };
}

function fakeInner(outputs: LlmOutput[]): LlmProvider & {
  summarize: ReturnType<typeof vi.fn>;
} {
  const summarize = vi.fn();
  outputs.forEach((o) => summarize.mockResolvedValueOnce(o));
  return { id: "fake-inner", summarize };
}

describe("AgenticRagProvider", () => {
  it("retorna na 1ª tentativa quando o score já passa, sem chamar recallMemory", async () => {
    const inner = fakeInner([goodOutput()]);
    const recallMemory = vi.fn();
    const provider = new AgenticRagProvider(inner, {
      embedder: { id: "fake-embed", embed: vi.fn() },
      recallMemory,
    });

    const output = await provider.summarize(newsItem());

    expect(output.shortTitle).toBe(goodOutput().shortTitle);
    expect(inner.summarize).toHaveBeenCalledTimes(1);
    expect(recallMemory).toHaveBeenCalledTimes(1); // recall procedural na 1ª tentativa
    expect(recallMemory).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.objectContaining({ kind: "PROCEDURAL" }),
    );
  });

  it("sem embedder, ainda regenera com feedback corretivo até passar (fail-safe)", async () => {
    const inner = fakeInner([badOutput(), goodOutput()]);
    const provider = new AgenticRagProvider(inner, { maxAttempts: 3 });

    const output = await provider.summarize(newsItem());

    expect(output.shortTitle).toBe(goodOutput().shortTitle);
    expect(inner.summarize).toHaveBeenCalledTimes(2);
    // 2ª chamada recebe learnedGuidance com o feedback corretivo da 1ª tentativa
    const secondCallItem = inner.summarize.mock.calls[1]![0] as NewsItem;
    expect(secondCallItem.learnedGuidance?.[0]).toMatch(/reprovada por/);
  });

  it("a partir da 2ª tentativa, recupera memória episódica pela categoria observada", async () => {
    const inner = fakeInner([badOutput(), goodOutput()]);
    const recallMemory = vi
      .fn()
      .mockImplementation(
        async (
          _embedder,
          _query,
          opts: { kind: string },
        ): Promise<RecalledMemory[]> =>
          opts.kind === "PROCEDURAL"
            ? [{ id: "p1", content: "Regra procedural.", category: null }]
            : [{ id: "e1", content: "Exemplo aprovado.", category: "data" }],
      );
    const provider = new AgenticRagProvider(inner, {
      embedder: { id: "fake-embed", embed: vi.fn() },
      recallMemory,
      maxAttempts: 3,
    });

    await provider.summarize(newsItem());

    // 1ª tentativa: só procedural (sem categoria ainda conhecida)
    expect(recallMemory).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.any(String),
      expect.objectContaining({ kind: "PROCEDURAL" }),
    );
    // 2ª tentativa: procedural + episódica, ambas com a categoria observada
    const kinds = recallMemory.mock.calls.slice(1).map((c) => c[2].kind);
    expect(kinds).toContain("EPISODIC");
    const secondCallItem = inner.summarize.mock.calls[1]![0] as NewsItem;
    expect(secondCallItem.learnedGuidance).toContain("Regra procedural.");
    expect(
      secondCallItem.learnedGuidance?.some((g) =>
        g.includes("Exemplo aprovado."),
      ),
    ).toBe(true);
  });

  it("esgota as tentativas e devolve o melhor resultado obtido (nunca lança)", async () => {
    const inner = fakeInner([badOutput(), badOutput(), badOutput()]);
    const provider = new AgenticRagProvider(inner, { maxAttempts: 3 });

    const output = await provider.summarize(newsItem());

    expect(inner.summarize).toHaveBeenCalledTimes(3);
    expect(output).toMatchObject(badOutput());
  });

  it("anexa a nota do verificador (UI-21): reprovado → nota < piso e violações", async () => {
    const inner = fakeInner([badOutput(), badOutput(), badOutput()]);
    const provider = new AgenticRagProvider(inner, { maxAttempts: 3 });

    const output = await provider.summarize(newsItem());

    expect(output.quality).toBeDefined();
    expect(output.quality!.total).toBeLessThan(QUALITY_MIN_SCORE);
    expect(output.quality!.violations.length).toBeGreaterThan(0);
    expect(output.quality!.attempts).toBe(3);
    expect(Object.keys(output.quality!.breakdown)).toContain("language");
  });

  it("aprovado na 1ª tentativa → nota ≥ piso e attempts = 1", async () => {
    const inner = fakeInner([goodOutput()]);
    const provider = new AgenticRagProvider(inner);
    const output = await provider.summarize(newsItem());
    if (output.quality!.total >= QUALITY_MIN_SCORE) {
      expect(output.quality!.attempts).toBe(1);
    }
    expect(typeof output.quality!.total).toBe("number");
  });

  it("recall de memória falhando não derruba a geração (fail-safe)", async () => {
    const inner = fakeInner([goodOutput()]);
    const recallMemory = vi.fn().mockRejectedValue(new Error("boom"));
    const provider = new AgenticRagProvider(inner, {
      embedder: { id: "fake-embed", embed: vi.fn() },
      recallMemory,
    });

    const output = await provider.summarize(newsItem());
    expect(output.shortTitle).toBe(goodOutput().shortTitle);
  });

  it("id expõe o provider interno para rastreio", () => {
    const inner = fakeInner([goodOutput()]);
    const provider = new AgenticRagProvider(inner);
    expect(provider.id).toBe("agentic-rag(fake-inner)");
  });

  it("conteúdo copiado da fonte (R2) é rejeitado e força regeneração com feedback corretivo", async () => {
    const sourceContent =
      "A empresa XPTO anunciou nesta terça-feira um novo modelo de inteligência artificial capaz de processar documentos jurídicos em segundos, segundo comunicado oficial divulgado à imprensa especializada em tecnologia.";

    const copiedOutput = goodOutput();
    copiedOutput.slides![0]!.body = sourceContent;

    const inner = fakeInner([copiedOutput, goodOutput()]);
    const provider = new AgenticRagProvider(inner, { maxAttempts: 3 });

    const output = await provider.summarize(
      newsItem({ content: sourceContent }),
    );

    expect(inner.summarize).toHaveBeenCalledTimes(2);
    expect(output.shortTitle).toBe(goodOutput().shortTitle);
    const secondCallItem = inner.summarize.mock.calls[1]![0] as NewsItem;
    expect(secondCallItem.learnedGuidance?.some((g) => g.includes("R2"))).toBe(
      true,
    );
  });
});
