import { AppError } from "@/lib/errors";
import { canonicalizeUrl } from "@/lib/url";
import type {
  NewsApiProvider,
  NewsApiQueryConfig,
  NewsItem,
  NewsSource,
} from "@/types";

type FetchFn = typeof fetch;

export interface NewsApiSourceOptions {
  /** Chave da News API (server-side, vinda de env — DEC-012). */
  apiKey: string;
  /** Injetável para testes (default: `fetch`). */
  fetchFn?: FetchFn;
  /** Timeout por requisição, em ms (default 10000). */
  timeoutMs?: number;
  /** Rate-limit: pausa entre requisições, em ms (default 0). */
  delayMs?: number;
  /** Hook de erro por query (o aggregator costuma logar; default: silencioso). */
  onQueryError?: (query: NewsApiQueryConfig, error: unknown) => void;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Adapter provider-agnóstico de News API (NewsAPI/GNews/NewsData) — DEC-005.
 * A chave só entra via env (server-side). Cada query roda sequencialmente,
 * respeitando `delayMs` (rate-limit), e cada provedor tem seu próprio mapeador
 * para `NewsItem`. Uma query que falha não derruba as outras.
 */
export class NewsApiSource implements NewsSource {
  readonly id = "newsapi";
  readonly kind = "newsapi" as const;

  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;
  private readonly delayMs: number;

  constructor(
    private readonly queries: NewsApiQueryConfig[],
    private readonly options: NewsApiSourceOptions,
  ) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.delayMs = options.delayMs ?? 0;
  }

  async collect(): Promise<NewsItem[]> {
    if (!this.options.apiKey) {
      throw new AppError(
        "NEWS_API_KEY ausente: configure a chave para coletar via News API.",
        500,
        "MISSING_NEWS_API_KEY",
      );
    }

    const all: NewsItem[] = [];
    for (const [index, query] of this.queries.entries()) {
      if (index > 0 && this.delayMs > 0) {
        await sleep(this.delayMs);
      }
      try {
        all.push(...(await this.collectQuery(query)));
      } catch (error) {
        this.options.onQueryError?.(query, error);
      }
    }
    return all;
  }

  private async collectQuery(query: NewsApiQueryConfig): Promise<NewsItem[]> {
    const adapter = PROVIDERS[query.provider];
    const json = await this.fetchJson(
      adapter.buildUrl(query, this.options.apiKey),
    );
    return adapter.parse(json);
  }

  private async fetchJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        // Não inclui a URL (contém a chave) na mensagem.
        throw new AppError(
          `News API respondeu HTTP ${res.status}.`,
          502,
          "NEWS_API_HTTP_ERROR",
        );
      }
      return (await res.json()) as unknown;
    } finally {
      clearTimeout(timer);
    }
  }
}

// --- Adapters por provedor -------------------------------------------------

interface ProviderAdapter {
  buildUrl(query: NewsApiQueryConfig, apiKey: string): string;
  parse(json: unknown): NewsItem[];
}

const PROVIDERS: Record<NewsApiProvider, ProviderAdapter> = {
  newsapi: {
    buildUrl(query, apiKey) {
      const url = new URL("https://newsapi.org/v2/everything");
      url.searchParams.set("q", query.query);
      url.searchParams.set("language", query.language);
      url.searchParams.set("sortBy", "publishedAt");
      url.searchParams.set("apiKey", apiKey);
      return url.toString();
    },
    parse(json) {
      return mapItems(asArray(asRecord(json).articles), "NewsAPI", (raw) => ({
        title: str(raw.title),
        summary: str(raw.description),
        url: str(raw.url),
        source: str(asRecord(raw.source).name),
        publishedAt: str(raw.publishedAt),
        image: str(raw.urlToImage),
      }));
    },
  },

  gnews: {
    buildUrl(query, apiKey) {
      const url = new URL("https://gnews.io/api/v4/search");
      url.searchParams.set("q", query.query);
      url.searchParams.set("lang", query.language);
      url.searchParams.set("sortby", "publishedAt");
      url.searchParams.set("apikey", apiKey);
      return url.toString();
    },
    parse(json) {
      return mapItems(asArray(asRecord(json).articles), "GNews", (raw) => ({
        title: str(raw.title),
        summary: str(raw.description),
        url: str(raw.url),
        source: str(asRecord(raw.source).name),
        publishedAt: str(raw.publishedAt),
        image: str(raw.image),
      }));
    },
  },

  newsdata: {
    buildUrl(query, apiKey) {
      const url = new URL("https://newsdata.io/api/1/news");
      url.searchParams.set("apikey", apiKey);
      url.searchParams.set("q", query.query);
      url.searchParams.set("language", query.language);
      return url.toString();
    },
    parse(json) {
      return mapItems(asArray(asRecord(json).results), "NewsData", (raw) => ({
        title: str(raw.title),
        summary: str(raw.description),
        url: str(raw.link),
        source: str(raw.source_id),
        publishedAt: str(raw.pubDate),
        image: str(raw.image_url),
      }));
    },
  },
};

// --- Helpers de mapeamento defensivo (resposta é `unknown`) ----------------

type RawFields = {
  title?: string;
  summary?: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  image?: string;
};

function mapItems(
  rawItems: unknown[],
  fallbackSource: string,
  extract: (raw: Record<string, unknown>) => RawFields,
): NewsItem[] {
  const items: NewsItem[] = [];
  for (const rawItem of rawItems) {
    const item = toNewsItem(extract(asRecord(rawItem)), fallbackSource);
    if (item) items.push(item);
  }
  return items;
}

function toNewsItem(
  fields: RawFields,
  fallbackSource: string,
): NewsItem | null {
  const title = fields.title?.trim();
  const url = fields.url?.trim();
  if (!title || !url) return null;

  const image = fields.image?.trim();
  return {
    title,
    summary: (fields.summary ?? "").trim(),
    url,
    canonicalUrl: canonicalizeUrl(url),
    source: fields.source?.trim() || fallbackSource,
    publishedAt: parseDate(fields.publishedAt),
    ...(image ? { imageUrl: image } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseDate(value: string | undefined): Date {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
