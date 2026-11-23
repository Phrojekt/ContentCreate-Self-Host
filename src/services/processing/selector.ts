import type { NewsItem } from "@/types";

/**
 * Seleciona as `topN` notícias mais recentes dentro da janela de recência.
 * Função pura — `now` é injetável para facilitar testes.
 *
 * Critério de ordenação (maior prioridade primeiro):
 * 1. Artigos com conteúdo completo extraído (`content` ≥ 500 chars) — menos
 *    alucinação do LLM porque há dados reais para trabalhar.
 * 2. Dentro de cada grupo, os mais recentes primeiro.
 */
export function selectTopN(
  items: NewsItem[],
  topN: number,
  recencyHours: number,
  now = new Date(),
): NewsItem[] {
  const MIN_RICH_CONTENT = 500;
  const cutoffMs = now.getTime() - recencyHours * 60 * 60 * 1000;
  return [...items]
    .filter((item) => item.publishedAt.getTime() >= cutoffMs)
    .sort((a, b) => {
      const aRich = (a.content?.length ?? 0) >= MIN_RICH_CONTENT ? 1 : 0;
      const bRich = (b.content?.length ?? 0) >= MIN_RICH_CONTENT ? 1 : 0;
      if (bRich !== aRich) return bRich - aRich; // conteúdo rico primeiro
      return b.publishedAt.getTime() - a.publishedAt.getTime(); // recência como desempate
    })
    .slice(0, topN);
}
