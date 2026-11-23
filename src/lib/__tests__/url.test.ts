import { describe, expect, it } from "vitest";

import { canonicalizeUrl } from "@/lib/url";

describe("canonicalizeUrl", () => {
  it("remove www, fragmento e parâmetros de rastreamento", () => {
    expect(
      canonicalizeUrl(
        "https://www.exemplo.com/noticia/?utm_source=x&utm_medium=y&id=42#secao",
      ),
    ).toBe("https://exemplo.com/noticia?id=42");
  });

  it("ordena a query e remove a barra final", () => {
    expect(canonicalizeUrl("https://exemplo.com/a/b/?b=2&a=1")).toBe(
      "https://exemplo.com/a/b?a=1&b=2",
    );
  });

  it("trata variantes da mesma notícia como iguais (base p/ dedup)", () => {
    const comTracking = canonicalizeUrl("https://www.site.com/post?fbclid=abc");
    const limpa = canonicalizeUrl("https://site.com/post/");
    expect(comTracking).toBe(limpa);
  });

  it("preserva a raiz e devolve o original se a URL for inválida", () => {
    expect(canonicalizeUrl("https://exemplo.com/")).toBe(
      "https://exemplo.com/",
    );
    expect(canonicalizeUrl("isto não é uma url")).toBe("isto não é uma url");
  });
});
