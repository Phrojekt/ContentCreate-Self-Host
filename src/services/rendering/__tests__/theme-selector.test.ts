import { describe, expect, it } from "vitest";
import { selectVariant } from "@/services/rendering/theme-selector";

describe("selectVariant", () => {
  it("retorna 'default' para notícia genérica de IA", () => {
    expect(
      selectVariant(
        "Modelos de linguagem avançam em raciocínio",
        "Pesquisadores avaliam capacidades de modelos LLM. Fonte: MIT",
      ),
    ).toBe("default");
  });

  it("retorna 'breaking' quando título contém 'lança'", () => {
    expect(
      selectVariant(
        "OpenAI lança nova versão do GPT",
        "A empresa anunciou o produto para o mercado. Fonte: The Verge",
      ),
    ).toBe("breaking");
  });

  it("retorna 'breaking' quando título contém 'anuncia'", () => {
    expect(
      selectVariant(
        "Google anuncia modelo Gemini Ultra 2",
        "Modelo chega com melhorias em raciocínio. Fonte: VentureBeat",
      ),
    ).toBe("breaking");
  });

  it("retorna 'breaking' quando contém 'launches' (inglês)", () => {
    expect(
      selectVariant(
        "Anthropic launches Claude 4",
        "New model features improved reasoning. Source: TechCrunch",
      ),
    ).toBe("breaking");
  });

  it("retorna 'data' quando título contém 'relatório'", () => {
    expect(
      selectVariant(
        "Relatório aponta crescimento de 40% no uso de IA em 2026",
        "Estudo foi conduzido com 500 empresas. Fonte: Gartner",
      ),
    ).toBe("data");
  });

  it("retorna 'data' quando legenda contém 'benchmark'", () => {
    expect(
      selectVariant(
        "Novo modelo de IA supera resultados anteriores",
        "O benchmark revelou ganhos de 35% em tarefas de raciocínio. Fonte: Papers",
      ),
    ).toBe("data");
  });

  it("retorna 'business' quando título contém 'startup'", () => {
    expect(
      selectVariant(
        "Startup brasileira de IA capta R$ 50 milhões",
        "Investimento liderado por fundo de capital de risco. Fonte: Exame",
      ),
    ).toBe("business");
  });

  it("retorna 'business' quando título contém 'aquisição'", () => {
    expect(
      selectVariant(
        "Microsoft confirma aquisição de empresa de BI",
        "Acordo avaliado em US$ 2 bilhões. Fonte: WSJ",
      ),
    ).toBe("business");
  });

  it("prioriza 'breaking' sobre 'data' quando ambos casam", () => {
    // "lançamento" (breaking) + "relatório" (data) — breaking tem prioridade.
    expect(
      selectVariant(
        "Lançamento do relatório anual de IA da OCDE",
        "O documento analisa adoção global. Fonte: OCDE",
      ),
    ).toBe("breaking");
  });

  it("é case-insensitive", () => {
    expect(
      selectVariant(
        "EMPRESA ANUNCIA NOVO PRODUTO DE IA",
        "Legenda qualquer. Fonte: Tech",
      ),
    ).toBe("breaking");
  });

  it("retorna 'default' para string vazia", () => {
    expect(selectVariant("", "")).toBe("default");
  });
});
