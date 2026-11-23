import { describe, expect, it } from "vitest";

import { buildPrompt, parseLlmJson } from "@/services/llm/prompt";
import type { NewsItem } from "@/types";

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: "Notícia de teste sobre IA",
    summary: "Resumo curto.",
    url: "https://exemplo.com/noticia",
    canonicalUrl: "https://exemplo.com/noticia",
    source: "Portal Teste",
    publishedAt: new Date("2026-06-18T00:00:00Z"),
    ...overrides,
  };
}

const repeat = (text: string, totalChars: number): string =>
  text.repeat(Math.ceil(totalChars / text.length)).slice(0, totalChars);

describe("buildPrompt", () => {
  it("sem corroboratingSources/learnedGuidance, não inclui as seções novas (custo zero)", () => {
    const prompt = buildPrompt(item());
    expect(prompt).not.toContain("FONTES CORRELATAS");
    expect(prompt).not.toContain("LIÇÕES E REGRAS APRENDIDAS");
  });

  it("inclui a seção de fontes correlatas com instrução de cross-checagem (DEC-019)", () => {
    const prompt = buildPrompt(
      item({
        corroboratingSources: [
          {
            source: "Outro Portal",
            title: "Mesmo fato, outra fonte",
            text: "Detalhe confirmando o mesmo lançamento.",
          },
        ],
      }),
    );
    expect(prompt).toContain("FONTES CORRELATAS");
    expect(prompt).toContain("SÓ para CONFIRMAR");
    expect(prompt).toContain("Outro Portal");
    expect(prompt).toContain("Detalhe confirmando o mesmo lançamento.");
  });

  it("inclui a seção de lições aprendidas logo após R0–R5 (DEC-020)", () => {
    const prompt = buildPrompt(
      item({
        learnedGuidance: ["Evite abrir com 'Segundo especialistas'."],
      }),
    );
    expect(prompt).toContain("LIÇÕES E REGRAS APRENDIDAS");
    expect(prompt).toContain("Evite abrir com 'Segundo especialistas'.");
    // aparece antes do arco narrativo (posicionamento importa p/ modelos menores)
    expect(prompt.indexOf("LIÇÕES E REGRAS APRENDIDAS")).toBeLessThan(
      prompt.indexOf("ARCO NARRATIVO"),
    );
  });

  it("pede só 2 slides e mostra o aviso de conteúdo limitado para resumo curto", () => {
    const prompt = buildPrompt(
      item({ summary: repeat("Frase curta sobre IA. ", 350) }),
    );

    expect(prompt).toContain("EXATAMENTE 2 slides de corpo");
    expect(prompt).toContain("CONTEÚDO LIMITADO");
    // esqueleto JSON com exatamente 2 objetos de slide (slideType + eyebrow + lead + body)
    const slideObjects = prompt.match(
      /\{"slideType": "[^"]+", "eyebrow": "[^"]+", "lead": "\.\.\.", "body": "\.\.\."\}/g,
    );
    expect(slideObjects).toHaveLength(2);
  });

  it("escala para mais slides e legenda mais longa com conteúdo extenso, sem o aviso de limitado", () => {
    const richContent = repeat(
      "A empresa anunciou um novo resultado sobre inteligência artificial nesta semana. ",
      3000,
    );
    const prompt = buildPrompt(item({ content: richContent }));

    expect(prompt).not.toContain("CONTEÚDO LIMITADO");
    expect(prompt).toContain("EXATAMENTE 6 slides de corpo");
    const slideObjects = prompt.match(
      /\{"slideType": "[^"]+", "eyebrow": "[^"]+", "lead": "\.\.\.", "body": "\.\.\."\}/g,
    );
    expect(slideObjects).toHaveLength(6);
  });

  it("usa o tier 'maximum' (9 slides) para artigos muito longos, respeitando o limite do Instagram", () => {
    const hugeContent = repeat(
      "Mais um fato concreto sobre o lançamento. ",
      9000,
    );
    const prompt = buildPrompt(item({ content: hugeContent }));

    expect(prompt).toContain("EXATAMENTE 9 slides de corpo");
  });

  it("prioriza item.content sobre item.summary quando ambos existem", () => {
    const prompt = buildPrompt(
      item({
        summary: "Resumo que não deve aparecer no prompt final.",
        content: repeat("Conteúdo integral do artigo, mais completo. ", 2000),
      }),
    );

    expect(prompt).not.toContain(
      "Resumo que não deve aparecer no prompt final.",
    );
    expect(prompt).toContain("Conteúdo integral do artigo");
  });

  it("trunca o conteúdo enviado ao limite de caracteres (não envia o artigo inteiro sem teto)", () => {
    const massiveContent = repeat("X", 20_000);
    const prompt = buildPrompt(item({ content: massiveContent }));

    // 9000 X's cabem, mas não as 20.000 inteiras.
    expect(prompt).not.toContain("X".repeat(9001));
  });

  it("credita a fonte no corpo das regras e na legenda esperada", () => {
    const prompt = buildPrompt(item({ source: "Canaltech" }));
    expect(prompt.match(/Fonte: Canaltech/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("inclui a regra R0 de idioma PT-BR", () => {
    const prompt = buildPrompt(item());
    expect(prompt).toContain("R0");
    expect(prompt).toContain("Português Brasileiro");
  });

  it("inclui slideType e eyebrow na especificação de campos", () => {
    const prompt = buildPrompt(item());
    expect(prompt).toContain("slideType");
    expect(prompt).toContain("eyebrow");
  });

  it("o último slot do placeholder de slides tem slideType 'closing'", () => {
    const prompt = buildPrompt(
      item({ summary: repeat("Frase curta sobre IA. ", 350) }),
    );
    expect(prompt).toContain(
      '{"slideType": "closing", "eyebrow": "RESUMO", "lead": "...", "body": "..."}',
    );
  });

  it("o checklist de auto-verificação cobra o idioma PT-BR (inclusive quote/fontes correlatas)", () => {
    const prompt = buildPrompt(item());
    expect(prompt).toContain("R0: Todo o texto está em Português Brasileiro");
    expect(prompt).toContain('incluindo "quote.text"');
  });

  it("o checklist de auto-verificação cobra R2 (reescrita, não paráfrase)", () => {
    const prompt = buildPrompt(item());
    expect(prompt).toContain("R2: reli cada slide contra a fonte");
  });

  it("R2 explica reescrita editorial vs. paráfrase superficial, com exemplo BOM/RUIM", () => {
    const prompt = buildPrompt(item());
    expect(prompt).toContain("REESCRITA EDITORIAL, NÃO PARÁFRASE");
    expect(prompt).toContain("RUIM (paráfrase superficial");
    expect(prompt).toContain("BOM (reescrita editorial real)");
  });

  it("citação deve ser traduzida para PT-BR mesmo se a fala original for em inglês", () => {
    const prompt = buildPrompt(item());
    expect(prompt).toContain(
      "Se a fala original estiver em inglês, TRADUZA para PT-BR",
    );
  });

  it("fontes correlatas em inglês não podem ser copiadas para o slide", () => {
    const prompt = buildPrompt(
      item({
        corroboratingSources: [
          {
            source: "TechCrunch",
            title: "OpenAI launches new model",
            text: "detail",
          },
        ],
      }),
    );
    expect(prompt).toContain("nunca copie a frase daqui para o slide/legenda");
  });

  it("evolui a persona com prioridade do leitor-decisor, leitura dupla e sobriedade (content-brain sec 1/2/4)", () => {
    const prompt = buildPrompt(item());
    expect(prompt).toContain("PRECISA DECIDIR");
    expect(prompt).toContain("teste da leitura dupla");
    expect(prompt).toMatch(/informa, não vende/);
  });

  it("shortTitle expõe as fórmulas de gancho e o teste dos 3 segundos (content-brain sec 7)", () => {
    const prompt = buildPrompt(item());
    expect(prompt).toContain("Curiosity gap");
    expect(prompt).toContain("O que está em jogo");
    expect(prompt).toContain("Teste dos 3 segundos");
    expect(prompt).toContain(
      "curiosity gap que não entrega queima confiança e é proibido",
    );
  });

  it("inclui o framework de copy PAS/BAB/AIDA e a regra de open loop (content-brain sec 8)", () => {
    const prompt = buildPrompt(item());
    expect(prompt).toContain("PAS (Problema → Agitação → Solução)");
    expect(prompt).toContain("BAB (Antes → Depois → Ponte)");
    expect(prompt).toContain("AIDA (Atenção → Interesse → Desejo → Ação)");
    expect(prompt).toContain("open loop");
  });

  it("o fechamento oferece CTA por objetivo (salvar/enviar/comentar) mantendo o 'Siga' como fecho (content-brain sec 10)", () => {
    const prompt = buildPrompt(item());
    expect(prompt).toContain("SALVAR (autoridade");
    expect(prompt).toContain("ENVIAR (crescimento");
    expect(prompt).toContain("COMENTAR (autoridade + alcance");
    expect(prompt).toContain("escreva exatamente esta linha de fecho");
    expect(prompt).toContain("secundário:");
  });

  it("o checklist pré-JSON cobra saveability/shareability (content-brain sec 12)", () => {
    const prompt = buildPrompt(item());
    expect(prompt).toContain("Salvaria? Tem algo para reler/usar depois?");
    expect(prompt).toContain(
      "Enviaria? Eu mandaria para um colega específico?",
    );
    expect(prompt).toContain('"e daí"');
    expect(prompt).toContain("teste dos 3 segundos, sem clickbait vazio");
    expect(prompt).toContain("framework reconhecível (PAS/BAB/AIDA)");
    expect(prompt).toContain("CTA primário (salvar/enviar/comentar)");
  });

  it("invariância: R5 continua exigindo o CTA exato 'Siga @handle' no slide final", () => {
    const prompt = buildPrompt(item());
    expect(prompt).toContain(
      "Siga @ia.e.dados para não perder o que vale a sua atenção em IA & Dados.",
    );
  });
});

describe("parseLlmJson", () => {
  it("remove cercas de markdown (```json ... ```) antes do parse", () => {
    const text =
      '```json\n{"shortTitle":"T","caption":"C. Fonte: X","hashtags":["a"]}\n```';
    const out = parseLlmJson(text, "X");
    expect(out.shortTitle).toBe("T");
    expect(out.hashtags).toEqual(["a"]);
  });

  it("devolve fallback creditando a fonte quando o texto não é JSON válido", () => {
    const out = parseLlmJson("isto não é json", "Portal Teste");
    expect(out.shortTitle).toBe("Notícia");
    expect(out.caption).toContain("Portal Teste");
    expect(out.hashtags).toEqual([]);
    expect(out.slides).toEqual([]);
  });

  it("parseia slides estruturados (gancho + parágrafo)", () => {
    const text = JSON.stringify({
      shortTitle: "T",
      caption: "C. Fonte: X",
      hashtags: [],
      slides: [
        { lead: "Como funciona", body: "Um parágrafo informativo de verdade." },
        { lead: "O impacto", body: "Outro parágrafo com um fato concreto." },
      ],
    });
    const out = parseLlmJson(text, "X");
    expect(out.slides).toEqual([
      { lead: "Como funciona", body: "Um parágrafo informativo de verdade." },
      { lead: "O impacto", body: "Outro parágrafo com um fato concreto." },
    ]);
  });

  it("parseia campos de arquétipo (slideType, eyebrow, stat, comparison, quote)", () => {
    const text = JSON.stringify({
      shortTitle: "T",
      caption: "C. Fonte: X",
      hashtags: [],
      slides: [
        {
          slideType: "stat",
          eyebrow: "O NÚMERO",
          lead: "Custo em queda",
          body: "Um parágrafo contextualizando o número.",
          stat: {
            value: "40%",
            label: "Redução de custo",
            supporting: "Amostra de 100 empresas",
          },
        },
        {
          slideType: "comparison",
          eyebrow: "ANTES / DEPOIS",
          lead: "O antes e o depois",
          body: "Explicando a comparação com fatos concretos.",
          comparison: {
            leftLabel: "Antes",
            leftValue: "40 min",
            rightLabel: "Depois",
            rightValue: "4 min",
          },
        },
        {
          slideType: "quote",
          eyebrow: "O QUE DISSERAM",
          lead: "A frase que resume",
          body: "Contextualizando quem disse e por quê importa.",
          quote: {
            text: "Isso muda tudo.",
            author: "Fulano de Tal",
            role: "CTO da Empresa",
          },
        },
        {
          slideType: "closing",
          eyebrow: "RESUMO",
          lead: "O fechamento",
          body: "Síntese final.",
        },
      ],
    });
    const out = parseLlmJson(text, "X");
    expect(out.slides?.[0]?.slideType).toBe("stat");
    expect(out.slides?.[0]?.eyebrow).toBe("O NÚMERO");
    expect(out.slides?.[0]?.stat).toEqual({
      value: "40%",
      label: "Redução de custo",
      supporting: "Amostra de 100 empresas",
    });
    expect(out.slides?.[1]?.comparison).toEqual({
      leftLabel: "Antes",
      leftValue: "40 min",
      rightLabel: "Depois",
      rightValue: "4 min",
    });
    expect(out.slides?.[2]?.quote).toEqual({
      text: "Isso muda tudo.",
      author: "Fulano de Tal",
      role: "CTO da Empresa",
    });
    expect(out.slides?.[3]?.slideType).toBe("closing");
  });

  it("ignora slideType inválido e stat/comparison/quote incompletos", () => {
    const text = JSON.stringify({
      shortTitle: "T",
      caption: "C. Fonte: X",
      hashtags: [],
      slides: [
        {
          slideType: "not-a-real-type",
          lead: "Lead",
          body: "Corpo válido do slide sem arquétipo reconhecido.",
          stat: { value: "40%" },
        },
      ],
    });
    const out = parseLlmJson(text, "X");
    expect(out.slides?.[0]?.slideType).toBeUndefined();
    expect(out.slides?.[0]?.stat).toBeUndefined();
  });

  it("tolera slides em formato antigo (strings soltas) virando body sem gancho", () => {
    const text = JSON.stringify({
      shortTitle: "T",
      caption: "C. Fonte: X",
      hashtags: [],
      slides: ["Frase solta de um rascunho antigo."],
    });
    const out = parseLlmJson(text, "X");
    expect(out.slides).toEqual([
      { lead: "", body: "Frase solta de um rascunho antigo." },
    ]);
  });
});
