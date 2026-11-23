import { describe, expect, it } from "vitest";

import { buildCarouselSlides, chunkText } from "@/services/rendering/slides";

describe("chunkText", () => {
  it("retorna vazio para texto vazio", () => {
    expect(chunkText("", 200)).toEqual([]);
  });

  it("mantém uma frase curta num único bloco", () => {
    expect(chunkText("Uma frase só.", 200)).toEqual(["Uma frase só."]);
  });

  it("agrupa frases até o limite e quebra ao exceder", () => {
    const a = "Frase A com algum tamanho.";
    const b = "Frase B também media.";
    const c = "Frase C fecha o conteudo.";
    const chunks = chunkText(`${a} ${b} ${c}`, a.length + b.length + 1);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain("Frase A");
    expect(chunks[1]).toContain("Frase C");
  });
});

describe("buildCarouselSlides", () => {
  const base = {
    shortTitle: "Manchete do post",
    sourceCredit: "Portal X",
    date: "18 de junho de 2026",
  };

  it("só capa quando não há conteúdo de corpo (post único, sem posição)", () => {
    const slides = buildCarouselSlides({ ...base, caption: "Fonte: Portal X" });
    expect(slides).toHaveLength(1);
    expect(slides[0]?.body).toBeUndefined();
    expect(slides[0]?.position).toBeUndefined();
  });

  it("usa os slides do LLM (gancho + parágrafo) como corpo quando presentes", () => {
    const slides = buildCarouselSlides({
      ...base,
      caption: "Legenda longa ignorada. Fonte: Portal X",
      slides: [
        { lead: "Primeiro", body: "Primeiro ponto." },
        { lead: "Segundo", body: "Segundo ponto." },
        { lead: "Terceiro", body: "Terceiro ponto." },
      ],
    });
    expect(slides).toHaveLength(4); // capa + 3
    expect(slides[0]?.position).toEqual({ index: 1, total: 4 });
    expect(slides[1]?.body).toBe("Primeiro ponto.");
    expect(slides[1]?.lead).toBe("Primeiro");
    expect(slides[3]?.position).toEqual({ index: 4, total: 4 });
  });

  it("propaga os campos de arquétipo (slideType/eyebrow/stat/comparison/quote)", () => {
    const slides = buildCarouselSlides({
      ...base,
      caption: "Legenda. Fonte: Portal X",
      slides: [
        {
          lead: "O número",
          body: "Contexto do número.",
          slideType: "stat",
          eyebrow: "O NÚMERO",
          stat: { value: "40%", label: "menos tempo" },
        },
        {
          lead: "Quem disse",
          body: "Contexto da fala.",
          slideType: "quote",
          quote: { text: "Frase real.", author: "Ana Souza", role: "CTO" },
        },
        {
          lead: "Antes e depois",
          body: "Contexto da comparação.",
          slideType: "comparison",
          eyebrow: "ANTES / DEPOIS",
          comparison: {
            leftLabel: "ANTES",
            leftValue: "3 dias",
            rightLabel: "DEPOIS",
            rightValue: "4 horas",
          },
        },
      ],
    });
    expect(slides[1]?.slideType).toBe("stat");
    expect(slides[1]?.eyebrow).toBe("O NÚMERO");
    expect(slides[1]?.stat).toEqual({ value: "40%", label: "menos tempo" });
    expect(slides[2]?.slideType).toBe("quote");
    expect(slides[2]?.quote?.author).toBe("Ana Souza");
    expect(slides[3]?.slideType).toBe("comparison");
    expect(slides[3]?.comparison?.rightValue).toBe("4 horas");
  });

  it("cai para a divisão da legenda quando não há slides do LLM", () => {
    const slides = buildCarouselSlides({
      ...base,
      caption: "Primeira frase aqui. Segunda frase aqui. Fonte: Portal X",
    });
    expect(slides.length).toBeGreaterThanOrEqual(2);
    expect(slides[0]?.body).toBeUndefined(); // capa
    expect(slides[1]?.body).toBeTruthy(); // corpo
    // o crédito "Fonte:" não vaza para o corpo (o rodapé já credita)
    expect(slides.every((s) => !(s.body ?? "").includes("Fonte:"))).toBe(true);
  });

  it("respeita maxSlides (capa + corpo)", () => {
    const slides = buildCarouselSlides(
      {
        ...base,
        caption: "x",
        slides: ["a", "b", "c", "d", "e", "f", "g"].map((s) => ({
          lead: s.toUpperCase(),
          body: `Corpo ${s}.`,
        })),
      },
      { maxSlides: 3 },
    );
    expect(slides).toHaveLength(3); // capa + 2 corpos
    expect(slides[0]?.position).toEqual({ index: 1, total: 3 });
  });

  it("cai para divisão da legenda (sem gancho) quando não há slides do LLM", () => {
    const slides = buildCarouselSlides({
      ...base,
      caption: "Primeira frase aqui. Segunda frase aqui. Fonte: Portal X",
    });
    const bodySlides = slides.filter((s) => s.body);
    expect(bodySlides.length).toBeGreaterThanOrEqual(1);
    // Sem slides estruturados do LLM, o corpo vem da legenda e não tem gancho.
    expect(bodySlides.every((s) => s.lead === undefined)).toBe(true);
  });

  it("aplica a imagem de fundo só na capa", () => {
    const slides = buildCarouselSlides({
      ...base,
      caption: "Corpo um. Corpo dois. Fonte: Portal X",
      backgroundImageUrl: "https://x.com/img.jpg",
    });
    expect(slides[0]?.backgroundImageUrl).toBe("https://x.com/img.jpg");
    expect(slides.slice(1).every((s) => !s.backgroundImageUrl)).toBe(true);
  });
});
