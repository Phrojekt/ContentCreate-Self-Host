import Parser from "rss-parser";

import { canonicalizeUrl } from "@/lib/url";
import type { NewsItem, NewsSource, RssFeedConfig } from "@/types";

/** Busca o XML de um feed. Injetável para testes (default: `fetch`). */
type FetchText = (url: string) => Promise<string>;

export interface RssSourceOptions {
  fetchText?: FetchText;
  /** Timeout por feed, em ms (default 10000) — usado pelo fetch padrão. */
  timeoutMs?: number;
  /** Hook de erro por feed (o aggregator costuma logar; default: silencioso). */
  onFeedError?: (feed: RssFeedConfig, error: unknown) => void;
}

const DEFAULT_TIMEOUT_MS = 10_000;

async function defaultFetchText(
  url: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/rss+xml, application/xml, text/xml" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao buscar feed RSS`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Coletor de múltiplos feeds RSS (DEC-004). Lê os feeds informados, normaliza
 * cada item para `NewsItem` e usa `feed.sourceName` como origem. Um feed que
 * falha não derruba os outros (Promise.all por feed, erro isolado).
 */
export class RssSource implements NewsSource {
  readonly id = "rss";
  readonly kind = "rss" as const;

  private readonly parser = new Parser();
  private readonly fetchText: FetchText;

  constructor(
    private readonly feeds: RssFeedConfig[],
    private readonly options: RssSourceOptions = {},
  ) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchText =
      options.fetchText ?? ((url) => defaultFetchText(url, timeoutMs));
  }

  async collect(): Promise<NewsItem[]> {
    const perFeed = await Promise.all(
      this.feeds.map((feed) => this.collectFeed(feed)),
    );
    return perFeed.flat();
  }

  private async collectFeed(feed: RssFeedConfig): Promise<NewsItem[]> {
    try {
      const xml = await this.fetchText(feed.url);
      const parsed = await this.parser.parseString(xml);
      return (parsed.items ?? [])
        .map((item) => this.toNewsItem(item, feed))
        .filter((item): item is NewsItem => item !== null);
    } catch (error) {
      this.options.onFeedError?.(feed, error);
      return [];
    }
  }

  private toNewsItem(item: Parser.Item, feed: RssFeedConfig): NewsItem | null {
    const title = item.title?.trim();
    const url = item.link?.trim();
    if (!title || !url) return null;

    const summary = (item.contentSnippet ?? item.content ?? "").trim();
    const imageUrl = item.enclosure?.url;

    return {
      title,
      summary,
      url,
      canonicalUrl: canonicalizeUrl(url),
      source: feed.sourceName,
      publishedAt: parseDate(item.isoDate ?? item.pubDate),
      ...(imageUrl ? { imageUrl } : {}),
    };
  }
}

/** Parser de data tolerante: fallback para o horário de coleta se inválida. */
function parseDate(value: string | undefined): Date {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
