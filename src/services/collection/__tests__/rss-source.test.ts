import { describe, expect, it, vi } from "vitest";

import { RssSource } from "@/services/collection/rss-source";
import type { RssFeedConfig } from "@/types";

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Feed Exemplo</title>
    <item>
      <title>Primeira notícia</title>
      <link>https://www.exemplo.com/n1?utm_source=rss#topo</link>
      <description>Resumo da primeira</description>
      <pubDate>Wed, 17 Jun 2026 10:00:00 GMT</pubDate>
      <enclosure url="https://exemplo.com/img1.jpg" type="image/jpeg" length="1000" />
    </item>
    <item>
      <description>Item sem título nem link — deve ser descartado</description>
    </item>
  </channel>
</rss>`;

const feed = (over: Partial<RssFeedConfig> = {}): RssFeedConfig => ({
  id: "ex",
  url: "https://feed.exemplo.com/rss",
  sourceName: "Feed Exemplo",
  ...over,
});

describe("RssSource", () => {
  it("normaliza itens e descarta os sem título/link", async () => {
    const fetchText = vi.fn().mockResolvedValue(RSS_FIXTURE);
    const source = new RssSource([feed()], { fetchText });

    const items = await source.collect();

    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.title).toBe("Primeira notícia");
    expect(item.source).toBe("Feed Exemplo");
    expect(item.summary).toBe("Resumo da primeira");
    expect(item.canonicalUrl).toBe("https://exemplo.com/n1");
    expect(item.imageUrl).toBe("https://exemplo.com/img1.jpg");
    expect(item.publishedAt.toISOString()).toBe("2026-06-17T10:00:00.000Z");
    expect(fetchText).toHaveBeenCalledWith("https://feed.exemplo.com/rss");
  });

  it("isola erro de um feed sem derrubar os outros", async () => {
    const fetchText = vi
      .fn()
      .mockResolvedValueOnce(RSS_FIXTURE)
      .mockRejectedValueOnce(new Error("feed fora do ar"));
    const onFeedError = vi.fn();

    const source = new RssSource(
      [
        feed({ id: "a", url: "https://a", sourceName: "A" }),
        feed({ id: "b", url: "https://b", sourceName: "B" }),
      ],
      { fetchText, onFeedError },
    );

    const items = await source.collect();

    expect(items).toHaveLength(1);
    expect(onFeedError).toHaveBeenCalledOnce();
  });
});
