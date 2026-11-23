import { describe, expect, it } from "vitest";

import {
  estimatePostCost,
  estimateTokens,
  sumCosts,
  type CostRates,
} from "@/services/cost/cost-estimator";

const rates: CostRates = {
  llm: {
    ollama: { inputPer1M: 0, outputPer1M: 0 },
    anthropic: { inputPer1M: 1.0, outputPer1M: 5.0 },
  },
  renderPerImage: 0,
};

describe("estimateTokens", () => {
  it("usa ~4 chars por token, arredondando p/ cima", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(4)).toBe(1);
    expect(estimateTokens(5)).toBe(2);
    expect(estimateTokens(4000)).toBe(1000);
  });

  it("nunca é negativo", () => {
    expect(estimateTokens(-100)).toBe(0);
  });
});

describe("estimatePostCost", () => {
  it("custo zero para provedor local (ollama)", () => {
    const c = estimatePostCost(
      { provider: "ollama", inputChars: 8000, outputChars: 4000, images: 4 },
      rates,
    );
    expect(c.totalUsd).toBe(0);
  });

  it("calcula custo de tokens para provedor pago (anthropic)", () => {
    // 4M chars in → 1M tokens × US$1 = US$1; 20M chars out → 5M tokens × US$5 = US$25.
    const c = estimatePostCost(
      {
        provider: "anthropic",
        inputChars: 4_000_000,
        outputChars: 20_000_000,
        images: 0,
      },
      rates,
    );
    expect(c.llmInputUsd).toBeCloseTo(1.0, 6);
    expect(c.llmOutputUsd).toBeCloseTo(25.0, 6);
    expect(c.totalUsd).toBeCloseTo(26.0, 6);
  });

  it("provedor desconhecido → tarifa zero (não quebra)", () => {
    const c = estimatePostCost(
      {
        provider: "inexistente",
        inputChars: 9999,
        outputChars: 9999,
        images: 3,
      },
      rates,
    );
    expect(c.totalUsd).toBe(0);
  });

  it("soma o custo de render quando há tarifa por imagem", () => {
    const c = estimatePostCost(
      { provider: "ollama", inputChars: 0, outputChars: 0, images: 4 },
      { ...rates, renderPerImage: 0.01 },
    );
    expect(c.renderUsd).toBeCloseTo(0.04, 6);
    expect(c.totalUsd).toBeCloseTo(0.04, 6);
  });
});

describe("sumCosts", () => {
  it("soma várias quebras de custo (agrega a rodada)", () => {
    const a = estimatePostCost(
      {
        provider: "anthropic",
        inputChars: 4_000_000,
        outputChars: 0,
        images: 0,
      },
      rates,
    );
    const b = estimatePostCost(
      {
        provider: "anthropic",
        inputChars: 4_000_000,
        outputChars: 0,
        images: 0,
      },
      rates,
    );
    expect(sumCosts([a, b]).totalUsd).toBeCloseTo(2.0, 6);
  });

  it("lista vazia → tudo zero", () => {
    expect(sumCosts([])).toEqual({
      llmInputUsd: 0,
      llmOutputUsd: 0,
      renderUsd: 0,
      totalUsd: 0,
    });
  });
});
