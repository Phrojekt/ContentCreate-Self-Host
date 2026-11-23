import { describe, expect, it } from "vitest";

import { computeContentTarget } from "@/services/llm/content-target";

describe("computeContentTarget", () => {
  it("usa o tier 'limited' para conteúdo raso (logo acima do piso do content-gate)", () => {
    const target = computeContentTarget(350);
    expect(target.tier).toBe("limited");
    expect(target.slideCount).toBe(2);
  });

  it("aumenta o número de slides conforme o conteúdo cresce", () => {
    const lens = [350, 1000, 2500, 4500, 8000];
    const counts = lens.map((n) => computeContentTarget(n).slideCount);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThan(counts[i - 1]!);
    }
  });

  it("é monotônico: nunca diminui o slideCount quando o conteúdo aumenta", () => {
    const lens = [
      0, 100, 299, 300, 899, 900, 1999, 2000, 3999, 4000, 6999, 7000, 50_000,
    ];
    let previous = -Infinity;
    for (const len of lens) {
      const { slideCount } = computeContentTarget(len);
      expect(slideCount).toBeGreaterThanOrEqual(previous);
      previous = slideCount;
    }
  });

  it("respeita os limiares exatos dos tiers (>= minChars já conta para o tier)", () => {
    expect(computeContentTarget(899).tier).toBe("limited");
    expect(computeContentTarget(900).tier).toBe("medium");
    expect(computeContentTarget(1999).tier).toBe("medium");
    expect(computeContentTarget(2000).tier).toBe("rich");
    expect(computeContentTarget(3999).tier).toBe("rich");
    expect(computeContentTarget(4000).tier).toBe("extensive");
    expect(computeContentTarget(6999).tier).toBe("extensive");
    expect(computeContentTarget(7000).tier).toBe("maximum");
  });

  it("usa o tier mais alto para conteúdo muito extenso, sem exceder o limite do Instagram", () => {
    const target = computeContentTarget(50_000);
    expect(target.tier).toBe("maximum");
    // +1 capa não pode passar de 10 (limite de slides do Instagram).
    expect(target.slideCount + 1).toBeLessThanOrEqual(10);
  });

  it("escala a faixa de frases e o piso de caracteres da legenda junto com os slides", () => {
    const limited = computeContentTarget(350);
    const maximum = computeContentTarget(50_000);
    expect(maximum.captionSentences.min).toBeGreaterThan(
      limited.captionSentences.min,
    );
    expect(maximum.captionSentences.max).toBeGreaterThan(
      limited.captionSentences.max,
    );
    expect(maximum.captionMinChars).toBeGreaterThan(limited.captionMinChars);
  });
});
