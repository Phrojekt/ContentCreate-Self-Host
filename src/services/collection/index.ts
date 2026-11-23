import { newsApiQueries, rssFeeds } from "@config/sources";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { NewsApiSource } from "@/services/collection/news-api-source";
import { RssSource } from "@/services/collection/rss-source";
import type { NewsItem, NewsSource, RssFeedConfig } from "@/types";

export { RssSource } from "@/services/collection/rss-source";
export { NewsApiSource } from "@/services/collection/news-api-source";
export type { RssSourceOptions } from "@/services/collection/rss-source";
export type { NewsApiSourceOptions } from "@/services/collection/news-api-source";

export interface CollectResult {
  items: NewsItem[];
  /** Contagem de itens por nome de fonte (diagnóstico). */
  bySource: Record<string, number>;
  /** Fontes que falharam por completo. */
  errors: { sourceId: string; error: unknown }[];
}

/**
 * Monta as fontes a partir de `config/sources.ts` + env (composition root).
 * É o ÚNICO ponto que conhece a config do nicho — os coletores em si são
 * genéricos. Sem feeds/queries configurados, devolve `[]`.
 */
export interface CollectHooks {
  /** Feed RSS que falhou nesta coleta (saúde por fonte — UI-31). */
  onFeedFailed?: (sourceName: string) => void;
  /** Feeds a coletar (DEC-027). Default: config/sources.ts. */
  feeds?: RssFeedConfig[];
}

export function buildConfiguredSources(hooks: CollectHooks = {}): NewsSource[] {
  const sources: NewsSource[] = [];

  const feeds = hooks.feeds ?? rssFeeds;
  if (feeds.length > 0) {
    sources.push(
      new RssSource(feeds, {
        onFeedError: (feed, error) => {
          hooks.onFeedFailed?.(feed.sourceName);
          logger.warn(
            { feedId: feed.id, err: errorMessage(error) },
            "Falha ao coletar feed RSS",
          );
        },
      }),
    );
  }

  if (newsApiQueries.length > 0) {
    if (!env.NEWS_API_KEY) {
      logger.warn(
        "NEWS_API_KEY ausente: queries de News API serão ignoradas nesta coleta.",
      );
    } else {
      sources.push(
        new NewsApiSource(newsApiQueries, {
          apiKey: env.NEWS_API_KEY,
          delayMs: 250,
          onQueryError: (query, error) =>
            logger.warn(
              { queryId: query.id, err: errorMessage(error) },
              "Falha em query de News API",
            ),
        }),
      );
    }
  }

  return sources;
}

/**
 * Executa as fontes em paralelo, de forma resiliente: uma fonte que falha por
 * completo não derruba as outras (ex.: API cai, RSS continua — DEC, fallback).
 */
export async function collectFromSources(
  sources: NewsSource[],
): Promise<CollectResult> {
  const perSource = await Promise.allSettled(
    sources.map((source) => source.collect()),
  );

  const items: NewsItem[] = [];
  const errors: { sourceId: string; error: unknown }[] = [];

  for (const [index, result] of perSource.entries()) {
    const source = sources[index];
    if (!source) continue;
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      errors.push({ sourceId: source.id, error: result.reason });
    }
  }

  const bySource: Record<string, number> = {};
  for (const item of items) {
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
  }

  return { items, bySource, errors };
}

/** Atalho: monta as fontes do nicho e coleta. */
export async function collect(
  hooks: CollectHooks = {},
): Promise<CollectResult> {
  return collectFromSources(buildConfiguredSources(hooks));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
