/**
 * Deduplicação semântica (DEC-006, P3): pega a MESMA notícia vinda de feeds
 * diferentes, com títulos distintos — que a similaridade textual (Jaccard) não
 * captura. Núcleo puro e testável: recebe itens + seus vetores e devolve itens.
 * A geração dos vetores (rede) fica no `EmbeddingProvider`, fora daqui.
 */

/** Similaridade do cosseno entre dois vetores. 0 se algum tiver norma zero. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Remove itens cujo vetor é semanticamente próximo (cosseno ≥ threshold) de um
 * item já mantido. Greedy: preserva o primeiro de cada grupo (mesma política da
 * dedup por título). `items` e `vectors` são alinhados por índice.
 */
export function deduplicateByEmbedding<T>(
  items: T[],
  vectors: number[][],
  threshold: number,
): T[] {
  const kept: T[] = [];
  const keptVectors: number[][] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const vector = vectors[i];
    if (item === undefined || vector === undefined) continue;

    const isDuplicate = keptVectors.some(
      (v) => cosineSimilarity(v, vector) >= threshold,
    );
    if (!isDuplicate) {
      kept.push(item);
      keptVectors.push(vector);
    }
  }

  return kept;
}

/**
 * Agrupa itens semanticamente próximos (cosseno ≥ threshold) em vez de
 * descartá-los (DEC-019) — a mesma notícia relatada por fontes diferentes na
 * MESMA rodada vira um grupo, não é jogada fora. Greedy: primeiro item de cada
 * grupo é o representante; a ordem de `items` é preservada. Usado pela dedup
 * semântica (Bloco 2) para reter as fontes irmãs como corroboração cross-source
 * em vez de perder esse conteúdo — ver `NewsItem.corroboratingSources`.
 */
export function clusterByEmbedding<T>(
  items: T[],
  vectors: number[][],
  threshold: number,
): T[][] {
  const clusters: { representativeVector: number[]; members: T[] }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const vector = vectors[i];
    if (item === undefined || vector === undefined) continue;

    const match = clusters.find(
      (c) => cosineSimilarity(c.representativeVector, vector) >= threshold,
    );
    if (match) {
      match.members.push(item);
    } else {
      clusters.push({ representativeVector: vector, members: [item] });
    }
  }

  return clusters.map((c) => c.members);
}
