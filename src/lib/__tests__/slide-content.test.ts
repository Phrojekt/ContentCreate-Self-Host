import { describe, expect, it } from "vitest";

import { parseSlideContentArray } from "@/lib/slide-content";

describe("parseSlideContentArray", () => {
  it("preserva slideType, eyebrow, stat, comparison e quote (não só lead/body)", () => {
    const slides = parseSlideContentArray([
      {
        slideType: "stat",
        eyebrow: "O NÚMERO",
        lead: "O resultado",
        body: "Contexto do número.",
        stat: { value: "40%", label: "menos tempo", supporting: "12 times" },
      },
      {
        slideType: "comparison",
        lead: "Antes e depois",
        body: "Explicação.",
        comparison: {
          leftLabel: "ANTES",
          leftValue: "3 dias",
          rightLabel: "DEPOIS",
          rightValue: "4 horas",
        },
      },
      {
        slideType: "quote",
        lead: "O que disseram",
        body: "Contexto da fala.",
        quote: { text: "Frase real.", author: "Ana Souza", role: "CTO" },
      },
    ]);

    expect(slides[0]).toMatchObject({
      slideType: "stat",
      eyebrow: "O NÚMERO",
      stat: { value: "40%", label: "menos tempo", supporting: "12 times" },
    });
    expect(slides[1]).toMatchObject({
      slideType: "comparison",
      comparison: expect.objectContaining({ rightValue: "4 horas" }),
    });
    expect(slides[2]).toMatchObject({
      slideType: "quote",
      quote: { text: "Frase real.", author: "Ana Souza", role: "CTO" },
    });
  });

  it("descarta slideType inválido, mas mantém lead/body", () => {
    const slides = parseSlideContentArray([
      { slideType: "inventado", lead: "x", body: "corpo válido" },
    ]);
    expect(slides[0]?.slideType).toBeUndefined();
    expect(slides[0]?.body).toBe("corpo válido");
  });

  it("tolera strings soltas (formato legado) — vira body sem lead", () => {
    const slides = parseSlideContentArray(["Só um parágrafo solto."]);
    expect(slides).toEqual([{ lead: "", body: "Só um parágrafo solto." }]);
  });

  it("descarta itens sem body aproveitável", () => {
    expect(parseSlideContentArray([{ lead: "sem corpo" }])).toEqual([]);
    expect(parseSlideContentArray(["   "])).toEqual([]);
  });

  it("valor não-array devolve vazio", () => {
    expect(parseSlideContentArray(null)).toEqual([]);
    expect(parseSlideContentArray("não é array")).toEqual([]);
  });
});
