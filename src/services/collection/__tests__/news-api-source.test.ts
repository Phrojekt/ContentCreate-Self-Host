import { describe, expect, it, vi } from "vitest";

import { NewsApiSource } from "@/services/collection/news-api-source";
import type { NewsApiQueryConfig } from "@/types";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const query = (over: Partial<NewsApiQueryConfig> = {}): NewsApiQueryConfig => ({
  id: "q1",
  query: "tema",
  language: "pt",
  provider: "newsapi",
  ...over,
});

const NEWSAPI_FIXTURE = {
  status: "ok",
  totalResults: 2,
  articles: [
    {
      source: { id: null, name: "TechCrunch" },
      title: "Título NewsAPI",
      description: "Resumo NewsAPI",
      url: "https://www.exemplo.com/na?utm_campaign=z",
      urlToImage: "https://exemplo.com/na.jpg",
      publishedAt: "2026-06-17T09:00:00Z",
    },
    // sem título -> descartado
    { source: { name: "X" }, title: null, url: "https://x.com/y" },
  ],
};

const GNEWS_FIXTURE = {
  totalArticles: 1,
  articles: [
    {
      title: "Título GNews",
      description: "Resumo GNews",
      url: "https://exemplo.com/gn",
      image: "https://exemplo.com/gn.jpg",
      publishedAt: "2026-06-17T08:00:00Z",
      source: { name: "Portal G", url: "https://portalg.com" },
    },
  ],
};

const NEWSDATA_FIXTURE = {
  status: "success",
  totalResults: 1,
  results: [
    {
      article_id: "abc",
      title: "Título NewsData",
      link: "https://exemplo.com/nd",
      description: "Resumo NewsData",
      pubDate: "2026-06-17 07:00:00",
      image_url: "https://exemplo.com/nd.jpg",
      source_id: "portalx",
    },
  ],
};

describe("NewsApiSource", () => {
  it("mapeia a resposta da NewsAPI e descarta itens sem título", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(NEWSAPI_FIXTURE));
    const source = new NewsApiSource([query()], { apiKey: "KEY", fetchFn });

    const items = await source.collect();

    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.title).toBe("Título NewsAPI");
    expect(item.source).toBe("TechCrunch");
    expect(item.summary).toBe("Resumo NewsAPI");
    expect(item.canonicalUrl).toBe("https://exemplo.com/na");
    expect(item.imageUrl).toBe("https://exemplo.com/na.jpg");

    const calledUrl = fetchFn.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("newsapi.org/v2/everything");
    expect(calledUrl).toContain("apiKey=KEY");
  });

  it("mapeia a resposta do GNews", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(GNEWS_FIXTURE));
    const source = new NewsApiSource([query({ provider: "gnews" })], {
      apiKey: "KEY",
      fetchFn,
    });

    const items = await source.collect();

    expect(items).toHaveLength(1);
    expect(items[0]!.source).toBe("Portal G");
    expect(items[0]!.canonicalUrl).toBe("https://exemplo.com/gn");
    const calledUrl = fetchFn.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("gnews.io/api/v4/search");
    expect(calledUrl).toContain("apikey=KEY");
  });

  it("mapeia a resposta do NewsData", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(NEWSDATA_FIXTURE));
    const source = new NewsApiSource([query({ provider: "newsdata" })], {
      apiKey: "KEY",
      fetchFn,
    });

    const items = await source.collect();

    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.source).toBe("portalx");
    expect(item.canonicalUrl).toBe("https://exemplo.com/nd");
    expect(Number.isNaN(item.publishedAt.getTime())).toBe(false);
    const calledUrl = fetchFn.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("newsdata.io/api/1/news");
    expect(calledUrl).toContain("apikey=KEY");
  });

  it("isola erro (HTTP 500) de uma query e segue com as demais", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(NEWSAPI_FIXTURE))
      .mockResolvedValueOnce(jsonResponse({}, 500));
    const onQueryError = vi.fn();

    const source = new NewsApiSource(
      [query({ id: "q1" }), query({ id: "q2", provider: "gnews" })],
      { apiKey: "KEY", fetchFn, onQueryError },
    );

    const items = await source.collect();

    expect(items).toHaveLength(1);
    expect(onQueryError).toHaveBeenCalledOnce();
  });

  it("lança erro claro quando falta a apiKey", async () => {
    const source = new NewsApiSource([query()], { apiKey: "" });
    await expect(source.collect()).rejects.toThrow(/NEWS_API_KEY/);
  });
});
