import { describe, expect, it } from "vitest";

import { filterByKeywords } from "@/services/processing/filter";
import type { NewsItem } from "@/types";
import type { KeywordsConfig } from "@config/keywords";

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: "Mercado de ações fecha em alta",
    summary: "O mercado apresentou ganhos significativos hoje",
    url: "https://exemplo.com",
    canonicalUrl: "https://exemplo.com",
    source: "Portal Financeiro",
    publishedAt: new Date(),
    ...overrides,
  };
}

describe("filterByKeywords", () => {
  it("deixa tudo passar quando as listas estão vazias", () => {
    const config: KeywordsConfig = { required: [], blocked: [] };
    const items = [item(), item({ title: "Qualquer notícia" })];
    expect(filterByKeywords(items, config)).toHaveLength(2);
  });

  it("mantém somente itens com ao menos uma palavra obrigatória", () => {
    const config: KeywordsConfig = {
      required: ["ações", "bolsa"],
      blocked: [],
    };
    const items = [
      item({ title: "Bolsa sobe 2% em dia de alta" }), // "bolsa" → passa
      item({ title: "Eleições: candidatos se inscrevem" }), // sem keyword → bloqueado
      item({ summary: "Alta das ações surpreende analistas" }), // "ações" no summary → passa
    ];
    expect(filterByKeywords(items, config)).toHaveLength(2);
  });

  it("descarta itens com palavra bloqueada mesmo que tenha keyword obrigatória", () => {
    const config: KeywordsConfig = {
      required: ["bolsa"],
      blocked: ["criptomoeda"],
    };
    const items = [
      item({ title: "Bolsa e criptomoeda em alta hoje" }), // ambas → bloqueado
      item({ title: "Bolsa fecha no positivo" }), // só obrigatória → passa
    ];
    expect(filterByKeywords(items, config)).toHaveLength(1);
    expect(filterByKeywords(items, config)[0]!.title).toContain("positivo");
  });

  it("busca é case-insensitive", () => {
    const config: KeywordsConfig = { required: ["BOLSA"], blocked: [] };
    const items = [item({ title: "bolsa fecha em alta" })];
    expect(filterByKeywords(items, config)).toHaveLength(1);
  });

  it("descarta itens sem nenhum token quando required não está vazia", () => {
    const config: KeywordsConfig = { required: ["tecnologia"], blocked: [] };
    const items = [
      item({ title: "Copa do Mundo 2026" }),
      item({ title: "Startup de tecnologia capta R$ 50 mi" }),
    ];
    expect(filterByKeywords(items, config)).toHaveLength(1);
  });

  it("casa por palavra inteira: 'ia' NÃO casa dentro de 'notícia'/'família'", () => {
    const config: KeywordsConfig = { required: ["ia"], blocked: [] };
    const items = [
      item({ title: "Notícia sobre a família real", summary: "história" }), // só substrings → bloqueado
      item({ title: "Avanço da IA no Brasil", summary: "" }), // "IA" inteira → passa
    ];
    const out = filterByKeywords(items, config);
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toContain("Avanço");
  });

  it("bloqueio também é por palavra inteira (não pega substring)", () => {
    const config: KeywordsConfig = { required: [], blocked: ["dc"] };
    const items = [
      item({ title: "Filme da DC estreia", summary: "" }), // "DC" inteira → bloqueado
      item({ title: "Edução e abduction não contêm a palavra", summary: "" }), // substring → passa
    ];
    const out = filterByKeywords(items, config);
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toContain("abduction");
  });
});
