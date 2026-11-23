import { describe, expect, it } from "vitest";

import { copyOverlapRatio } from "@/services/llm/originality-check";

const source =
  "Pesquisadores da Stanford University desenvolveram um novo modelo de raciocínio que corta pela metade o tempo necessário para analisar grandes volumes de dados corporativos, segundo um estudo divulgado nesta semana. O modelo foi testado em doze times de analytics ao longo de noventa dias e apresentou ganhos consistentes de produtividade em todos os cenários avaliados pelos autores da pesquisa.";

describe("copyOverlapRatio", () => {
  it("reescrita real (sem trechos literais) tem sobreposição ~0", () => {
    const rewritten =
      "Um estudo recente mostrou que um novo tipo de inteligência artificial consegue acelerar bastante a rotina de quem trabalha com dados. Em vez de passar horas cruzando planilhas, times inteiros conseguiram cortar esse tempo praticamente na metade, segundo os pesquisadores responsáveis pelo experimento, que rodou por três meses em times reais.";
    expect(copyOverlapRatio(rewritten, source)).toBeCloseTo(0, 2);
  });

  it("texto parcialmente copiado (uma sentença literal) tem sobreposição alta", () => {
    const copied =
      "Pesquisadores da Stanford University desenvolveram um novo modelo de raciocínio que corta pela metade o tempo necessário para analisar grandes volumes de dados corporativos. O modelo foi testado em doze times de analytics ao longo de noventa dias.";
    expect(copyOverlapRatio(copied, source)).toBeGreaterThan(0.5);
  });

  it("texto idêntico à fonte tem sobreposição 1", () => {
    expect(copyOverlapRatio(source, source)).toBeCloseTo(1, 5);
  });

  it("textos curtos demais para formar um shingle de 8 palavras devolvem 0", () => {
    expect(copyOverlapRatio("frase curta", source)).toBe(0);
    expect(copyOverlapRatio("", source)).toBe(0);
  });

  it("fonte vazia devolve 0 (sem risco de divisão por zero)", () => {
    expect(
      copyOverlapRatio(
        "qualquer texto gerado aqui com palavras suficientes",
        "",
      ),
    ).toBe(0);
  });

  it("é insensível a maiúsculas/acentuação e pontuação (mesmo texto, só reformatado)", () => {
    const reformatted = source.toUpperCase().replace(/[.,]/g, "!");
    expect(copyOverlapRatio(reformatted, source)).toBeCloseTo(1, 5);
  });
});
