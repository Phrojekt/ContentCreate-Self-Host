// Barrel + composition root do módulo de embeddings (dedup semântica — P3).
import { env } from "@/lib/env";
import type { NewsItem } from "@/types";
import type { EmbeddingProvider } from "./embedding-provider";
import { OllamaEmbeddingProvider } from "./ollama-embedding-provider";

export type { EmbeddingProvider } from "./embedding-provider";
export { OllamaEmbeddingProvider } from "./ollama-embedding-provider";
export type { OllamaEmbeddingOptions } from "./ollama-embedding-provider";

/** Provider default: Ollama local (nomic-embed-text), sem custo de API. */
export function buildEmbeddingProvider(): EmbeddingProvider {
  return new OllamaEmbeddingProvider({
    baseUrl: env.OLLAMA_URL,
    model: env.OLLAMA_EMBED_MODEL,
  });
}

/** Texto representativo de uma notícia para embedding (título + início do resumo). */
export function newsItemEmbedText(item: NewsItem): string {
  const summary = item.summary.slice(0, 240);
  return `${item.title}\n${summary}`.trim();
}

/** Gera os vetores de uma lista de notícias (uma chamada batched ao provider). */
export function embedNewsItems(
  provider: EmbeddingProvider,
  items: NewsItem[],
): Promise<number[][]> {
  return provider.embed(items.map(newsItemEmbedText));
}
