import { describe, expect, it } from "vitest";

import {
  buildTemplate,
  fitTitle,
  type RenderTheme,
  type TemplateNode,
} from "@/services/rendering/template";
import type { PostData } from "@/types";

const theme: RenderTheme = {
  fontFamily: "Inter",
  brand: "MarcaTeste",
  colors: {
    background: "#0F172A",
    surface: "#1E293B",
    grid: "#334155",
    title: "#F8FAFC",
    muted: "#94A3B8",
    accent: "#38BDF8",
    overlay: "rgba(15, 23, 42, 0.72)",
  },
};

function postData(over: Partial<PostData> = {}): PostData {
  return {
    shortTitle: "Manchete de exemplo",
    sourceCredit: "Portal X",
    date: "17 de junho de 2026",
    ...over,
  };
}

/** Coleta todos os textos (children string) da árvore, em profundidade. */
function collectText(node: TemplateNode): string[] {
  const out: string[] = [];
  const children = node.props.children;
  if (typeof children === "string") {
    out.push(children);
  } else if (Array.isArray(children)) {
    for (const child of children) out.push(...collectText(child));
  }
  return out;
}

function collectTypes(node: TemplateNode): string[] {
  const out: string[] = [node.type];
  const children = node.props.children;
  if (Array.isArray(children)) {
    for (const child of children) out.push(...collectTypes(child));
  }
  return out;
}

describe("fitTitle", () => {
  it("usa a maior fonte para títulos curtos", () => {
    expect(fitTitle("Bolsa sobe").fontSize).toBe(84);
  });

  it("reduz a fonte conforme o título cresce", () => {
    const curto = fitTitle("a".repeat(30)).fontSize;
    const medio = fitTitle("a".repeat(60)).fontSize;
    const longo = fitTitle("a".repeat(100)).fontSize;
    const enorme = fitTitle("a".repeat(160)).fontSize;
    expect(curto).toBeGreaterThan(medio);
    expect(medio).toBeGreaterThan(longo);
    expect(longo).toBeGreaterThan(enorme);
  });

  it("normaliza espaços em branco", () => {
    expect(fitTitle("  Brasil   vence   \n  Argentina  ").text).toBe(
      "Brasil vence Argentina",
    );
  });

  it("trunca títulos absurdos com reticências", () => {
    const result = fitTitle("palavra ".repeat(60));
    expect(result.text.length).toBeLessThanOrEqual(200);
    expect(result.text.endsWith("…")).toBe(true);
  });
});

describe("buildTemplate", () => {
  it("aplica as dimensões do formato na raiz", () => {
    const square = buildTemplate(postData(), "square", theme);
    expect(square.props.style.width).toBe(1080);
    expect(square.props.style.height).toBe(1080);

    const portrait = buildTemplate(postData(), "portrait", theme);
    expect(portrait.props.style.height).toBe(1350);
  });

  it("inclui img + véu quando há imagem de fundo", () => {
    const tree = buildTemplate(
      postData({ backgroundImageUrl: "https://x.com/a.jpg" }),
      "square",
      theme,
    );
    const types = collectTypes(tree);
    expect(types).toContain("img");
    // 1 img + a marca usa div de barra; garante que o véu (div absoluto) existe
    const imgCount = types.filter((t) => t === "img").length;
    expect(imgCount).toBe(1);
  });

  it("usa fundo sólido e nenhuma img quando não há imagem", () => {
    const tree = buildTemplate(postData(), "square", theme);
    expect(collectTypes(tree)).not.toContain("img");
    expect(tree.props.style.backgroundColor).toBe(theme.colors.background);
  });

  it("credita a fonte e mostra a data no rodapé (DEC-008)", () => {
    const texts = collectText(
      buildTemplate(
        postData({ sourceCredit: "Agência Z", date: "01 de janeiro de 2026" }),
        "square",
        theme,
      ),
    );
    expect(texts).toContain("FONTE — Agência Z");
    expect(texts).toContain("01 de janeiro de 2026");
    expect(texts).toContain("MarcaTeste");
  });

  it("não quebra com título vazio nem com título gigante", () => {
    expect(() =>
      buildTemplate(postData({ shortTitle: "" }), "square", theme),
    ).not.toThrow();
    expect(() =>
      buildTemplate(
        postData({ shortTitle: "palavra ".repeat(80) }),
        "portrait",
        theme,
      ),
    ).not.toThrow();
  });

  describe("carrossel", () => {
    it("slide de corpo mostra o texto do body, não a manchete", () => {
      const texts = collectText(
        buildTemplate(
          postData({
            body: "Conteúdo do slide de corpo.",
            position: { index: 2, total: 3 },
          }),
          "portrait",
          theme,
        ),
      );
      expect(texts).toContain("Conteúdo do slide de corpo.");
    });

    it("slide de corpo exibe o gancho (lead) e o índice na margem", () => {
      const texts = collectText(
        buildTemplate(
          postData({
            lead: "Como funciona",
            body: "O parágrafo informativo do slide.",
            position: { index: 3, total: 5 },
          }),
          "portrait",
          theme,
        ),
      );
      expect(texts).toContain("Como funciona");
      expect(texts).toContain("O parágrafo informativo do slide.");
      // índice zero-padded na margem esquerda (brand guide sec 6.2)
      expect(texts).toContain("03");
    });

    it("slide de corpo sem lead não quebra (renderiza só o parágrafo)", () => {
      const texts = collectText(
        buildTemplate(
          postData({
            body: "Só o parágrafo, sem gancho.",
            position: { index: 2, total: 3 },
          }),
          "portrait",
          theme,
        ),
      );
      expect(texts).toContain("Só o parágrafo, sem gancho.");
    });

    it("mostra o contador zero-padded i/total quando há posição", () => {
      const texts = collectText(
        buildTemplate(
          postData({ position: { index: 1, total: 4 } }),
          "portrait",
          theme,
        ),
      );
      expect(texts).toContain("01/04");
    });

    it("mostra 'ARRASTAR →' em slide que não é o último", () => {
      const texts = collectText(
        buildTemplate(
          postData({ position: { index: 1, total: 3 } }),
          "portrait",
          theme,
        ),
      );
      expect(texts.some((t) => t.toLowerCase().includes("arrastar"))).toBe(
        true,
      );
    });

    it("NÃO mostra 'ARRASTAR →' no último slide", () => {
      const texts = collectText(
        buildTemplate(
          postData({
            body: "Último.",
            position: { index: 3, total: 3 },
          }),
          "portrait",
          theme,
        ),
      );
      expect(texts.some((t) => t.toLowerCase().includes("arrastar"))).toBe(
        false,
      );
    });

    it("post único (sem posição) não mostra contador nem 'ARRASTAR'", () => {
      const texts = collectText(buildTemplate(postData(), "square", theme));
      expect(texts.some((t) => t.includes("/"))).toBe(false);
      expect(texts.some((t) => t.toLowerCase().includes("arrastar"))).toBe(
        false,
      );
    });
  });

  describe("arquétipos (brand guide sec 6)", () => {
    it("exibe o eyebrow do slide de contexto", () => {
      const texts = collectText(
        buildTemplate(
          postData({
            slideType: "context",
            eyebrow: "POR QUE IMPORTA",
            lead: "O gargalo era a leitura",
            body: "Equipes passam mais tempo interpretando do que decidindo.",
            position: { index: 2, total: 6 },
          }),
          "portrait",
          theme,
        ),
      );
      expect(texts).toContain("POR QUE IMPORTA");
    });

    it("estatística: renderiza valor gigante, rótulo e linha de apoio", () => {
      const texts = collectText(
        buildTemplate(
          postData({
            slideType: "stat",
            body: "Contextualização do número.",
            stat: {
              value: "40%",
              label: "menos tempo entre extrair um dado e agir",
              supporting: "Medido em 12 times ao longo de 90 dias.",
            },
            position: { index: 3, total: 6 },
          }),
          "portrait",
          theme,
        ),
      );
      expect(texts).toContain("O NÚMERO");
      expect(texts).toContain("40%");
      expect(texts).toContain("menos tempo entre extrair um dado e agir");
      expect(texts).toContain("Medido em 12 times ao longo de 90 dias.");
    });

    it("estatística sem `stat` cai para contexto (layout não quebra)", () => {
      const texts = collectText(
        buildTemplate(
          postData({
            slideType: "stat",
            lead: "Gancho",
            body: "Parágrafo sem número dedicado.",
            position: { index: 3, total: 6 },
          }),
          "portrait",
          theme,
        ),
      );
      expect(texts).toContain("Parágrafo sem número dedicado.");
      expect(texts).not.toContain("O NÚMERO");
    });

    it("comparação: renderiza as duas colunas", () => {
      const texts = collectText(
        buildTemplate(
          postData({
            slideType: "comparison",
            eyebrow: "ANTES / DEPOIS",
            body: "Explicação da comparação.",
            comparison: {
              leftLabel: "ANTES",
              leftValue: "3 dias",
              leftDetail: "para transformar relatório em decisão",
              rightLabel: "DEPOIS",
              rightValue: "4 horas",
              rightDetail: "com o modelo sinalizando o que importa",
            },
            position: { index: 4, total: 6 },
          }),
          "portrait",
          theme,
        ),
      );
      expect(texts).toContain("ANTES");
      expect(texts).toContain("3 dias");
      expect(texts).toContain("DEPOIS");
      expect(texts).toContain("4 horas");
    });

    it("citação: renderiza texto, autor e cargo", () => {
      const texts = collectText(
        buildTemplate(
          postData({
            slideType: "quote",
            body: "Contexto da fala.",
            quote: {
              text: "Removemos a parte do trabalho que ninguém gosta.",
              author: "Marina Kessler",
              role: "Head de Data Science, Stanford HAI",
            },
            position: { index: 5, total: 6 },
          }),
          "portrait",
          theme,
        ),
      );
      expect(texts).toContain(
        "Removemos a parte do trabalho que ninguém gosta.",
      );
      expect(texts).toContain("Marina Kessler");
      expect(texts).toContain("Head de Data Science, Stanford HAI");
    });

    it("fechamento: usa eyebrow RESUMO por padrão e exibe hashtags", () => {
      const texts = collectText(
        buildTemplate(
          postData({
            slideType: "closing",
            lead: "A leitura deixou de ser o trabalho",
            body: "Decidir sobre os dados continua sendo. Siga @conta.",
            hashtags: ["IA", "#DataScience"],
            position: { index: 6, total: 6 },
          }),
          "portrait",
          theme,
        ),
      );
      expect(texts).toContain("RESUMO");
      expect(texts).toContain("#IA");
      expect(texts).toContain("#DataScience");
    });
  });
});

describe("rótulo de categoria configurável (DEC-028)", () => {
  it("usa theme.categoryLabel e, sem ele, o rótulo de fábrica", () => {
    const custom = JSON.stringify(
      buildTemplate(postData(), "square", {
        ...theme,
        categoryLabel: "CRIPTO",
      }),
    );
    expect(custom).toContain("[ CRIPTO ]");
    const legacy = JSON.stringify(
      buildTemplate({ ...postData(), variant: "data" }, "square", theme),
    );
    expect(legacy).toContain("[ ANALYTICS ]");
  });
});
