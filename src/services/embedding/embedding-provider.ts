/**
 * Fronteira de I/O para geração de embeddings (DEC-005). Trocar de modelo/
 * provedor = nova classe; o domínio (dedup semântica) não sabe quem gera os
 * vetores. Implementação atual: `OllamaEmbeddingProvider` (nomic-embed-text).
 */
export interface EmbeddingProvider {
  readonly id: string;
  /** Gera um vetor por texto de entrada (mesma ordem da entrada). */
  embed(texts: string[]): Promise<number[][]>;
}
