import { describe, expect, it } from "vitest";

import {
  sanitizeHashtag,
  sanitizeLlmOutput,
  sanitizeSlides,
  stripHashtagsFromCaption,
  stripHtml,
} from "@/services/llm/sanitize";

describe("stripHtml", () => {
  it("remove tags <a> deixando o texto", () => {
    expect(
      stripHtml('Veja em <a href="https://x.com">Portal X</a>. Fonte: Y'),
    ).toBe("Veja em Portal X. Fonte: Y");
  });

  it("remove tags de formatação", () => {
    expect(stripHtml("Texto <b>importante</b> e <i>ênfase</i>")).toBe(
      "Texto importante e ênfase",
    );
  });

  it("colapsa espaços horizontais mas preserva quebras de parágrafo", () => {
    expect(stripHtml("linha 1\n\nlinha   2")).toBe("linha 1\n\nlinha 2");
  });

  it("remove tag truncada no fim (sem '>')", () => {
    expect(stripHtml('Inscreva-se: <a href="https://x.com')).toBe(
      "Inscreva-se:",
    );
  });

  it("não estraga '<' literal seguido de espaço (ex.: 5 < 10)", () => {
    expect(stripHtml("crescimento de 5 < 10 por cento")).toBe(
      "crescimento de 5 < 10 por cento",
    );
  });
});

describe("sanitizeHashtag", () => {
  it("junta palavras separadas por espaço", () => {
    expect(sanitizeHashtag("PUC Campinas")).toBe("PUCCampinas");
  });

  it("remove o # inicial e mantém acentos", () => {
    expect(sanitizeHashtag("#Inteligência Artificial")).toBe(
      "InteligênciaArtificial",
    );
  });

  it("descarta pontuação e símbolos", () => {
    expect(sanitizeHashtag("data-science!")).toBe("datascience");
  });

  it("retorna string vazia quando não sobra nada", () => {
    expect(sanitizeHashtag("#!@ ")).toBe("");
  });
});

describe("stripHashtagsFromCaption", () => {
  it("remove hashtags soltas do fim da legenda", () => {
    expect(
      stripHashtagsFromCaption("Ótima notícia! O que você acha? #IA #Tech"),
    ).toBe("Ótima notícia! O que você acha?");
  });

  it("preserva a prosa e não deixa espaço órfão antes de pontuação", () => {
    expect(stripHashtagsFromCaption("Texto #tag final.")).toBe("Texto final.");
  });

  it("não altera legenda sem hashtags", () => {
    expect(stripHashtagsFromCaption("Sem hashtags aqui. Fonte: X")).toBe(
      "Sem hashtags aqui. Fonte: X",
    );
  });
});

describe("sanitizeSlides", () => {
  it("retorna vazio para undefined", () => {
    expect(sanitizeSlides(undefined)).toEqual([]);
  });

  it("remove HTML e hashtags soltas do gancho e do parágrafo, descarta vazios", () => {
    expect(
      sanitizeSlides([
        {
          lead: "Como <b>funciona</b>",
          body: "Primeira ideia <b>importante</b>.",
        },
        { lead: "O resultado", body: "Segunda ideia. #ia #dados" },
        { lead: "Vazio", body: "   " },
      ]),
    ).toEqual([
      { lead: "Como funciona", body: "Primeira ideia importante." },
      { lead: "O resultado", body: "Segunda ideia." },
    ]);
  });

  it("descarta slides cujo corpo é placeholder copiado do prompt", () => {
    expect(
      sanitizeSlides([
        { lead: "X", body: "Slide 1" },
        { lead: "Ponto-chave", body: "Ponto importante real." },
        { lead: "Y", body: "Texto do slide" },
      ]),
    ).toEqual([{ lead: "Ponto-chave", body: "Ponto importante real." }]);
  });

  it("zera o gancho placeholder/vazio mas mantém o slide se o corpo é válido", () => {
    expect(
      sanitizeSlides([
        { lead: "Slide 2", body: "Conteúdo real e específico." },
      ]),
    ).toEqual([{ lead: "", body: "Conteúdo real e específico." }]);
  });

  it("preserva slideType, eyebrow, stat, comparison e quote removendo HTML", () => {
    expect(
      sanitizeSlides([
        {
          lead: "O número",
          body: "Contexto do dado.",
          slideType: "stat",
          eyebrow: "<b>O NÚMERO</b>",
          stat: {
            value: "<i>40%</i>",
            label: "Redução de custo",
            supporting: "Amostra <b>real</b>",
          },
        },
        {
          lead: "O antes e depois",
          body: "Explicando a comparação.",
          slideType: "comparison",
          comparison: {
            leftLabel: "<b>Antes</b>",
            leftValue: "40 min",
            rightLabel: "Depois",
            rightValue: "<b>4 min</b>",
          },
        },
        {
          lead: "A frase",
          body: "Contexto da citação.",
          slideType: "quote",
          quote: {
            text: "<i>Isso muda tudo.</i>",
            author: "Fulano",
            role: "CTO",
          },
        },
      ]),
    ).toEqual([
      {
        lead: "O número",
        body: "Contexto do dado.",
        slideType: "stat",
        eyebrow: "O NÚMERO",
        stat: {
          value: "40%",
          label: "Redução de custo",
          supporting: "Amostra real",
        },
      },
      {
        lead: "O antes e depois",
        body: "Explicando a comparação.",
        slideType: "comparison",
        comparison: {
          leftLabel: "Antes",
          leftValue: "40 min",
          rightLabel: "Depois",
          rightValue: "4 min",
        },
      },
      {
        lead: "A frase",
        body: "Contexto da citação.",
        slideType: "quote",
        quote: { text: "Isso muda tudo.", author: "Fulano", role: "CTO" },
      },
    ]);
  });

  it("omite a chave eyebrow quando fica vazia após strip", () => {
    const [slide] = sanitizeSlides([
      { lead: "L", body: "Corpo válido do slide.", eyebrow: "   " },
    ]);
    expect(slide).not.toHaveProperty("eyebrow");
  });

  it("não quebra slides sem nenhum dos campos novos (rascunhos antigos)", () => {
    expect(
      sanitizeSlides([{ lead: "L", body: "Corpo antigo sem arquétipo." }]),
    ).toEqual([{ lead: "L", body: "Corpo antigo sem arquétipo." }]);
  });
});

describe("sanitizeLlmOutput", () => {
  it("limpa HTML do título e da legenda e normaliza hashtags", () => {
    const out = sanitizeLlmOutput({
      shortTitle: "100 vagas <b>gratuitas</b>",
      caption: 'Acesse <a href="https://x.com">aqui</a>. Fonte: Google News',
      hashtags: ["#PUC Campinas", "Inteligência Artificial", "vagas gratuitas"],
    });

    expect(out.shortTitle).toBe("100 vagas gratuitas");
    expect(out.caption).toBe("Acesse aqui. Fonte: Google News");
    expect(out.hashtags).toEqual([
      "PUCCampinas",
      "InteligênciaArtificial",
      "vagasgratuitas",
    ]);
  });

  it("remove hashtags vazias e duplicadas (case-insensitive)", () => {
    const out = sanitizeLlmOutput({
      shortTitle: "T",
      caption: "C",
      hashtags: ["IA", "ia", "#!@", "Dados"],
    });
    expect(out.hashtags).toEqual(["IA", "Dados"]);
  });
});
