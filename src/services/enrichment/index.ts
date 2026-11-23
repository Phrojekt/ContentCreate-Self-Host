// Barrel + composition root do enriquecimento (leitura do artigo — Bloco 2).
import { logger } from "@/lib/logger";
import type { NewsItem } from "@/types";
import type { ArticleExtractor } from "./article-extractor";
import { HttpArticleExtractor } from "./article-extractor";

export { extractArticleBody } from "./article-body";
export type { ArticleExtractor } from "./article-extractor";
export { HttpArticleExtractor } from "./article-extractor";
export type { HttpArticleExtractorOptions } from "./article-extractor";

/** Extrator default (HTTP). */
export function buildArticleExtractor(): ArticleExtractor {
  return new HttpArticleExtractor();
}

/** Tamanho mínimo do artigo extraído para valer a pena trocar pelo resumo. */
const MIN_GAIN_RATIO = 1.2;

/**
 * Enriquece um item com o texto integral do artigo, se a extração render mais
 * conteúdo que o resumo do RSS. Fail-safe: em falha/ganho baixo, devolve o item
 * intacto (mantém o `summary`). Preenche `content` (transiente, não persistido).
 */
export async function enrichWithArticle(
  extractor: ArticleExtractor,
  item: NewsItem,
): Promise<NewsItem> {
  const body = await extractor.extract(item.url);
  if (!body || body.length < item.summary.length * MIN_GAIN_RATIO) {
    return item;
  }
  logger.info(
    {
      title: item.title,
      summaryLen: item.summary.length,
      contentLen: body.length,
    },
    "Artigo lido (conteúdo enriquecido)",
  );
  return { ...item, content: body };
}
