import { describe, expect, it } from "vitest";

import {
  countEnglishMarkers,
  looksLikeEnglish,
} from "@/services/llm/language-check";

describe("looksLikeEnglish", () => {
  it("não sinaliza texto em PT-BR", () => {
    const samples = [
      "O modelo de linguagem reduziu o tempo de análise de dados em 40% segundo o estudo da Stanford, que acompanhou doze times de analytics ao longo de noventa dias.",
      "Não substituímos o analista. Removemos a parte do trabalho que nenhum analista gosta de fazer, disse a executiva durante o evento em São Paulo.",
      "Você adotaria isso no seu time agora ou esperaria mais evidências? Siga @ia.e.dados para não perder o que vale a sua atenção em IA e Dados.",
    ];
    for (const s of samples) expect(looksLikeEnglish(s)).toBe(false);
  });

  it("sinaliza texto em inglês", () => {
    const samples = [
      "The company announced that their new model would reduce the time researchers need to analyze large datasets, according to a study released this week.",
      "This is a huge deal because it changes how companies think about their data pipelines, and analysts say the impact will be significant.",
    ];
    for (const s of samples) expect(looksLikeEnglish(s)).toBe(true);
  });

  it("ignora textos curtos (< 6 palavras) — amostra pequena não é confiável", () => {
    expect(looksLikeEnglish("The end.")).toBe(false);
  });

  it("nomes próprios/siglas isolados não disparam falso positivo", () => {
    expect(
      looksLikeEnglish(
        "A OpenAI lançou o GPT-5 com foco em raciocínio para desenvolvedores.",
      ),
    ).toBe(false);
  });
});

describe("countEnglishMarkers", () => {
  it("conta ocorrências com fronteira de palavra (não substring solta)", () => {
    // "the" não deve casar dentro de "there"/"other"
    expect(countEnglishMarkers("there are other options")).toBe(1); // só "other"
    expect(countEnglishMarkers("the the the")).toBe(3);
  });
});
