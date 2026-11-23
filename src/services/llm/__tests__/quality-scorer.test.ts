import { describe, expect, it } from "vitest";

import type { ContentTarget } from "@/services/llm/content-target";
import { scoreOutput } from "@/services/llm/quality-scorer";
import type { LlmOutput } from "@/services/llm/llm-provider";

const HANDLE = "@ia.e.dados";

const MEDIUM_TARGET: ContentTarget = {
  tier: "medium",
  slideCount: 4,
  minWordsPerSlide: 30,
  maxWordsPerSlide: 55,
  captionSentences: { min: 4, max: 6 },
  captionMinChars: 380,
};

function makeBody(words: number): string {
  return Array.from({ length: words }, (_, i) => `palavra${i}`).join(" ");
}

function perfectOutput(): LlmOutput {
  return {
    shortTitle: "Governo lança matriz de competências para IA",
    slides: [
      { slideType: "context", lead: "O anúncio", body: makeBody(35) },
      {
        slideType: "stat",
        lead: "O número",
        body: makeBody(35),
        stat: { value: "40%", label: "menos tempo de análise" },
      },
      { slideType: "context", lead: "Na prática", body: makeBody(35) },
      {
        slideType: "closing",
        lead: "Vale debater",
        body: `${makeBody(20)} Você adotaria isso no seu time agora? Siga ${HANDLE} para não perder o que vale a sua atenção em IA & Dados.`,
      },
    ],
    caption: "A".repeat(380) + " Fonte: Canaltech",
    hashtags: ["IA", "Governo", "Dados", "MachineLearning", "Capacitação"],
  };
}

describe("scoreOutput", () => {
  it("aprova output perfeito com ≥ 90 pontos", () => {
    const result = scoreOutput(perfectOutput(), MEDIUM_TARGET, HANDLE);
    expect(result.passed).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(90);
    expect(result.violations).toHaveLength(0);
  });

  it("penaliza slide count errado (−15 pts)", () => {
    const out = perfectOutput();
    out.slides = out.slides!.slice(0, 3); // 3 em vez de 4
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.slideCount).toBe(0);
    expect(result.violations.some((v) => v.includes("Slides:"))).toBe(true);
  });

  it("penaliza lead que copia nome de slot antigo", () => {
    const out = perfectOutput();
    out.slides![1]!.lead = "Causa e Contexto";
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.leadQuality).toBeLessThan(20);
    expect(result.violations.some((v) => v.includes("proibido"))).toBe(true);
  });

  it("penaliza lead que copia nome de slot novo", () => {
    const out = perfectOutput();
    out.slides![0]!.lead = "Fato Central";
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.leadQuality).toBeLessThan(20);
  });

  it("penaliza lead vazio", () => {
    const out = perfectOutput();
    out.slides![2]!.lead = "";
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.leadQuality).toBeLessThan(20);
    expect(result.violations.some((v) => v.includes("vazio"))).toBe(true);
  });

  it("penaliza body abaixo do mínimo", () => {
    const out = perfectOutput();
    out.slides![0]!.body = makeBody(15); // abaixo de 30
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.bodyLength).toBeLessThan(20);
    expect(result.violations.some((v) => v.includes("mínimo"))).toBe(true);
  });

  it("penaliza CTA ausente no último slide (−15 pts)", () => {
    const out = perfectOutput();
    out.slides![3]!.body = "Você adotaria isso? Pense bem sobre o assunto.";
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.lastSlide).toBeLessThanOrEqual(5); // só a pergunta
    expect(result.violations.some((v) => v.includes("CTA"))).toBe(true);
  });

  it("penaliza pergunta ausente no último slide (−5 pts)", () => {
    const out = perfectOutput();
    out.slides![3]!.body = `Siga ${HANDLE} para não perder o que vale a sua atenção.`;
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.lastSlide).toBe(15); // só o CTA
    expect(result.violations.some((v) => v.includes("pergunta"))).toBe(true);
  });

  it("penaliza caption sem 'Fonte:'", () => {
    const out = perfectOutput();
    out.caption = "A".repeat(400); // comprimento ok, mas sem Fonte:
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.caption).toBe(5); // só min chars
    expect(result.violations.some((v) => v.includes("Fonte:"))).toBe(true);
  });

  it("penaliza caption abaixo do mínimo de caracteres", () => {
    const out = perfectOutput();
    out.caption = "Caption curta. Fonte: Canaltech";
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.caption).toBe(5); // só fonte
    expect(result.violations.some((v) => v.includes("chars"))).toBe(true);
  });

  it("penaliza hashtags fora da faixa 5–8", () => {
    const out = perfectOutput();
    out.hashtags = ["IA", "Dados"]; // só 2
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.hashtags).toBe(0);
    expect(result.violations.some((v) => v.includes("Hashtags"))).toBe(true);
  });

  it("penaliza shortTitle vazio", () => {
    const out = perfectOutput();
    out.shortTitle = "";
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.shortTitle).toBe(0);
  });

  it("resultado total nunca ultrapassa 100", () => {
    const result = scoreOutput(perfectOutput(), MEDIUM_TARGET, HANDLE);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it("output vazio reprova com poucos pontos e não lança exceção", () => {
    const empty: LlmOutput = {
      shortTitle: "",
      slides: [],
      caption: "",
      hashtags: [],
    };
    const result = scoreOutput(empty, MEDIUM_TARGET, HANDLE);
    // Sem conteúdo, as 7 dimensões de estrutura zeram; os 3 gates novos
    // (idioma/originalidade/variedade) não têm sinal de violação num texto
    // vazio — ficam neutros (não há como estar "em inglês" ou "copiado" ou
    // "monótono" sem texto nenhum). O total fica bem abaixo do piso de 90.
    expect(result.total).toBeLessThan(50);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("lead genérico 'Tecnologia' é proibido", () => {
    const out = perfectOutput();
    out.slides![0]!.lead = "Tecnologia";
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.leadQuality).toBeLessThan(20);
  });

  it("lead com acentuação normalizada ainda é detectado como proibido", () => {
    const out = perfectOutput();
    out.slides![0]!.lead = "Inovação"; // com acento
    const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
    expect(result.breakdown.leadQuality).toBeLessThan(20);
  });

  describe("gate de idioma (R0)", () => {
    it("reprova com teto rígido quando o texto vaza para o inglês", () => {
      const out = perfectOutput();
      out.slides![0]!.body =
        "The company announced that their new model would reduce the time researchers need to analyze data, according to a study released this week.";
      const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
      expect(result.breakdown.language).toBe(0);
      expect(result.total).toBeLessThanOrEqual(40);
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.includes("R0 violado"))).toBe(
        true,
      );
    });

    it("texto todo em PT-BR não aciona o gate", () => {
      const result = scoreOutput(perfectOutput(), MEDIUM_TARGET, HANDLE);
      expect(result.breakdown.language).toBe(20);
    });
  });

  describe("gate de originalidade (R2)", () => {
    const source =
      "Pesquisadores da Stanford University desenvolveram um novo modelo de raciocínio que corta pela metade o tempo necessário para analisar grandes volumes de dados corporativos, segundo um estudo divulgado nesta semana pelos autores.";

    it("sem sourceText, não penaliza (gate pulado)", () => {
      const result = scoreOutput(perfectOutput(), MEDIUM_TARGET, HANDLE);
      expect(result.breakdown.originality).toBe(15);
    });

    it("reprova com teto rígido quando o texto é essencialmente copiado da fonte", () => {
      const out = perfectOutput();
      out.slides![0]!.body = source;
      const result = scoreOutput(out, MEDIUM_TARGET, HANDLE, source);
      expect(result.breakdown.originality).toBe(0);
      expect(result.total).toBeLessThanOrEqual(50);
      expect(result.violations.some((v) => v.includes("R2 violado"))).toBe(
        true,
      );
    });

    it("reescrita de verdade (sem sobreposição) pontua cheio", () => {
      const result = scoreOutput(
        perfectOutput(),
        MEDIUM_TARGET,
        HANDLE,
        source,
      );
      expect(result.breakdown.originality).toBe(15);
    });
  });

  describe("gate de variedade de arquétipo (brand guide sec 8)", () => {
    it("penaliza quando o mesmo arquétipo se repete mais de 2x seguidas", () => {
      const out = perfectOutput();
      out.slides = [
        { slideType: "context", lead: "a", body: makeBody(35) },
        { slideType: "context", lead: "b", body: makeBody(35) },
        { slideType: "context", lead: "c", body: makeBody(35) },
        {
          slideType: "closing",
          lead: "d",
          body: `${makeBody(20)} Você toparia? Siga ${HANDLE} para não perder o que vale a sua atenção em IA & Dados.`,
        },
      ];
      const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
      expect(result.breakdown.archetypeVariety).toBeLessThan(10);
      expect(
        result.violations.some((v) => v.includes("repetido mais de 2")),
      ).toBe(true);
    });

    it("penaliza quando nenhum arquétipo rico aparece num carrossel com espaço para isso", () => {
      const out = perfectOutput();
      out.slides = [
        { slideType: "context", lead: "a", body: makeBody(35) },
        { slideType: "context", lead: "b", body: makeBody(35) },
        { slideType: "context", lead: "c", body: makeBody(35) },
        {
          slideType: "closing",
          lead: "d",
          body: `${makeBody(20)} Você toparia? Siga ${HANDLE} para não perder o que vale a sua atenção em IA & Dados.`,
        },
      ];
      const result = scoreOutput(out, MEDIUM_TARGET, HANDLE);
      expect(
        result.violations.some((v) => v.includes("Nenhum arquétipo rico")),
      ).toBe(true);
    });

    it("carrossel com arquétipo rico (stat/comparison/quote) não é penalizado", () => {
      const result = scoreOutput(perfectOutput(), MEDIUM_TARGET, HANDLE);
      expect(result.breakdown.archetypeVariety).toBe(10);
    });
  });
});
