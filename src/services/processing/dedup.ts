import type { NewsItem } from "@/types";

/**
 * Calcula a similaridade de Jaccard entre dois conjuntos de tokens (DEC-006).
 * Retorna 0 (sem sobreposição) a 1 (idênticos).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) => new Set(s.toLowerCase().match(/\w+/g) ?? []);
  const setA = tokenize(a);
  const setB = tokenize(b);

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/** Fase 1: remove duplicatas por URL canônica. O primeiro item vence. */
export function deduplicateByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.canonicalUrl)) return false;
    seen.add(item.canonicalUrl);
    return true;
  });
}

/**
 * Fase 2: remove notícias cujo título é similar demais a um já selecionado.
 * O primeiro item na lista tem precedência (mais recente = mais confiável se já ordenado).
 */
export function deduplicateByTitle(
  items: NewsItem[],
  threshold: number,
): NewsItem[] {
  const result: NewsItem[] = [];
  for (const item of items) {
    const isDuplicate = result.some(
      (existing) => jaccardSimilarity(item.title, existing.title) >= threshold,
    );
    if (!isDuplicate) result.push(item);
  }
  return result;
}

/**
 * Deduplicação completa: URL canônica (fase 1) + similaridade de título (fase 2).
 * `titleThreshold` padrão vem de `config/project.config.ts` (0.85).
 */
export function deduplicate(
  items: NewsItem[],
  titleThreshold = 0.85,
): NewsItem[] {
  return deduplicateByTitle(deduplicateByUrl(items), titleThreshold);
}
