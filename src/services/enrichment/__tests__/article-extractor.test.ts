import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { HttpArticleExtractor } from "@/services/enrichment/article-extractor";

const ARTICLE =
  "Conteúdo de artigo com tamanho mais que suficiente para ser considerado útil pela extração. ".repeat(
    6,
  );

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

describe("HttpArticleExtractor", () => {
  it("baixa o HTML e extrai o corpo do artigo", async () => {
    const html = `<script type="application/ld+json">{"articleBody":"${ARTICLE}"}</script>`;
    const fetchFn = vi.fn().mockResolvedValue(htmlResponse(html));
    const extractor = new HttpArticleExtractor({ fetchFn });

    const out = await extractor.extract("https://portal.com/noticia");

    expect(out).toContain("Conteúdo de artigo");
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["User-Agent"]).toContain(
      "Mozilla",
    );
  });

  it("retorna null em resposta não-ok (fail-safe)", async () => {
    const extractor = new HttpArticleExtractor({
      fetchFn: vi.fn().mockResolvedValue(htmlResponse("erro", 404)),
    });
    expect(await extractor.extract("https://x.com")).toBeNull();
  });

  it("retorna null quando o content-type não é HTML", async () => {
    const extractor = new HttpArticleExtractor({
      fetchFn: vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    });
    expect(await extractor.extract("https://x.com/api")).toBeNull();
  });

  it("retorna null (não lança) quando o fetch falha", async () => {
    const extractor = new HttpArticleExtractor({
      fetchFn: vi.fn().mockRejectedValue(new Error("timeout")),
    });
    expect(await extractor.extract("https://x.com")).toBeNull();
  });
});
