import { describe, expect, it } from "vitest";

import { extractArticleBody } from "@/services/enrichment/article-body";

const LONG =
  "Este é um parágrafo de teste com conteúdo suficiente para passar do limite mínimo. ".repeat(
    8,
  );

describe("extractArticleBody", () => {
  it("extrai o articleBody do JSON-LD (caminho preferido)", () => {
    const html = `<html><head>
      <script type="application/ld+json">
      {"@type":"NewsArticle","headline":"X","articleBody":"${LONG}"}
      </script></head><body><p>ruído</p></body></html>`;
    const out = extractArticleBody(html);
    expect(out).toContain("parágrafo de teste");
    expect(out!.length).toBeGreaterThan(400);
  });

  it("acha articleBody dentro de um @graph aninhado", () => {
    const html = `<script type="application/ld+json">
      {"@graph":[{"@type":"WebPage"},{"@type":"Article","articleBody":"${LONG}"}]}
      </script>`;
    expect(extractArticleBody(html)).toContain("parágrafo de teste");
  });

  it("cai para os <p> de dentro do <article> quando não há JSON-LD", () => {
    const p =
      "<p>" +
      "Frase longa o suficiente para contar como parágrafo. ".repeat(3) +
      "</p>";
    const html = `<article>${p}${p}${p}</article>`;
    const out = extractArticleBody(html);
    expect(out).toContain("Frase longa");
  });

  it("remove tags e scripts do texto extraído", () => {
    const html = `<script type="application/ld+json">
      {"articleBody":"<b>Negrito</b> e <a href='x'>link</a>. ${LONG}"}
      </script>`;
    const out = extractArticleBody(html);
    expect(out).not.toContain("<b>");
    expect(out).not.toContain("href");
    expect(out).toContain("Negrito");
  });

  it("retorna null para página sem conteúdo útil (ex.: redirect JS)", () => {
    const html = `<html><body><script>window.location='x'</script></body></html>`;
    expect(extractArticleBody(html)).toBeNull();
  });
});
