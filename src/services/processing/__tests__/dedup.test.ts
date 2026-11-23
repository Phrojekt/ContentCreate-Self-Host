import { describe, expect, it } from "vitest";

import {
  deduplicate,
  deduplicateByTitle,
  deduplicateByUrl,
  jaccardSimilarity,
} from "@/services/processing/dedup";
import type { NewsItem } from "@/types";

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: "Título padrão da notícia",
    summary: "Resumo",
    url: "https://exemplo.com/noticia",
    canonicalUrl: "https://exemplo.com/noticia",
    source: "Fonte",
    publishedAt: new Date(),
    ...overrides,
  };
}

describe("jaccardSimilarity", () => {
  it("retorna 1 para strings idênticas", () => {
    expect(
      jaccardSimilarity(
        "brasil ganha copa do mundo",
        "brasil ganha copa do mundo",
      ),
    ).toBe(1);
  });

  it("retorna 0 para strings sem tokens em comum", () => {
    expect(jaccardSimilarity("futebol brasileiro", "eleições 2026")).toBe(0);
  });

  it("retorna valor entre 0 e 1 para sobreposição parcial", () => {
    const sim = jaccardSimilarity("brasil ganha copa", "brasil perde copa");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe("deduplicateByUrl", () => {
  it("remove itens com a mesma URL canônica, preserva o primeiro", () => {
    const items = [
      item({ canonicalUrl: "https://a.com/1", title: "Primeira" }),
      item({ canonicalUrl: "https://a.com/1", title: "Duplicata" }),
      item({ canonicalUrl: "https://a.com/2", title: "Diferente" }),
    ];
    const result = deduplicateByUrl(items);
    expect(result).toHaveLength(2);
    expect(result[0]!.title).toBe("Primeira");
  });

  it("não modifica a lista quando não há duplicatas", () => {
    const items = [
      item({ canonicalUrl: "https://a.com/1" }),
      item({ canonicalUrl: "https://a.com/2" }),
    ];
    expect(deduplicateByUrl(items)).toHaveLength(2);
  });
});

describe("deduplicateByTitle", () => {
  it("remove títulos quase idênticos (diferença de 1 token em 9)", () => {
    const items = [
      item({ title: "Brasil vence Argentina de 3 a 0 no Maracanã" }), // 9 tokens
      item({ title: "Brasil vence Argentina 3 a 0 no Maracanã" }), // J≈0.89 → dup
      item({ title: "Copa do Mundo começa em junho de 2026 na Europa" }), // diferente
    ];
    const result = deduplicateByTitle(items, 0.85);
    expect(result).toHaveLength(2);
    expect(result[1]!.title).toContain("Copa do Mundo");
  });

  it("preserva itens com títulos distintos", () => {
    const items = [
      item({ title: "Eleições 2026: candidatos confirmados" }),
      item({ title: "Mercado financeiro fecha em alta" }),
    ];
    expect(deduplicateByTitle(items, 0.85)).toHaveLength(2);
  });
});

describe("deduplicate (2 fases)", () => {
  it("aplica URL dedup e depois título dedup em sequência", () => {
    const items = [
      item({
        canonicalUrl: "https://a.com/1",
        title: "Brasil vence Argentina de 3 a 0 no Maracanã",
      }),
      item({
        canonicalUrl: "https://a.com/1",
        title: "Qualquer título (URL duplicada)",
      }), // removido na fase 1
      item({
        canonicalUrl: "https://a.com/2",
        title: "Brasil vence Argentina 3 a 0 no Maracanã",
      }), // J≈0.89 → removido na fase 2
      item({
        canonicalUrl: "https://b.com/1",
        title: "Eleições 2026: candidatos confirmados pelo TSE",
      }),
    ];
    const result = deduplicate(items, 0.85);
    expect(result).toHaveLength(2);
  });
});
