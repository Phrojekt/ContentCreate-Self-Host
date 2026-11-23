import { describe, expect, it } from "vitest";

import { selectTopN } from "@/services/processing/selector";
import type { NewsItem } from "@/types";

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: "Notícia",
    summary: "Resumo",
    url: "https://exemplo.com",
    canonicalUrl: "https://exemplo.com",
    source: "Fonte",
    publishedAt: new Date(),
    ...overrides,
  };
}

const NOW = new Date("2026-06-17T12:00:00Z");

describe("selectTopN", () => {
  it("seleciona no máximo N itens", () => {
    const items = [
      item({ publishedAt: new Date("2026-06-17T11:00:00Z") }),
      item({ publishedAt: new Date("2026-06-17T10:00:00Z") }),
      item({ publishedAt: new Date("2026-06-17T09:00:00Z") }),
    ];
    expect(selectTopN(items, 2, 24, NOW)).toHaveLength(2);
  });

  it("ordena do mais recente para o mais antigo", () => {
    const items = [
      item({
        title: "Mais antiga",
        publishedAt: new Date("2026-06-17T08:00:00Z"),
      }),
      item({
        title: "Mais recente",
        publishedAt: new Date("2026-06-17T11:00:00Z"),
      }),
      item({
        title: "Intermediária",
        publishedAt: new Date("2026-06-17T10:00:00Z"),
      }),
    ];
    const result = selectTopN(items, 3, 24, NOW);
    expect(result[0]!.title).toBe("Mais recente");
    expect(result[2]!.title).toBe("Mais antiga");
  });

  it("exclui itens fora da janela de recência", () => {
    const items = [
      item({ publishedAt: new Date("2026-06-17T11:00:00Z") }), // 1h atrás → dentro
      item({ publishedAt: new Date("2026-06-16T10:00:00Z") }), // 26h atrás → fora
    ];
    expect(selectTopN(items, 5, 24, NOW)).toHaveLength(1);
  });

  it("retorna lista vazia quando não há itens recentes suficientes", () => {
    const items = [item({ publishedAt: new Date("2026-06-15T00:00:00Z") })]; // 48h atrás
    expect(selectTopN(items, 5, 24, NOW)).toHaveLength(0);
  });

  it("retorna todos os itens quando topN é maior que a lista", () => {
    const items = [
      item({ publishedAt: new Date("2026-06-17T11:00:00Z") }),
      item({ publishedAt: new Date("2026-06-17T10:00:00Z") }),
    ];
    expect(selectTopN(items, 10, 24, NOW)).toHaveLength(2);
  });
});
