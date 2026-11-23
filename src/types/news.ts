// Contratos de domínio do Bloco 1 (Coleta).
// Estes tipos são o "cano" da esteira — mudanças aqui afetam todos os blocos.

/**
 * Notícia bruta, normalizada (saída do Bloco 1).
 *
 * `summary` é apenas o resumo/snippet fornecido pela fonte — NUNCA o texto
 * integral da matéria (direitos autorais, DEC-008). O conteúdo do post é
 * reescrito depois pelo `LlmProvider` (Bloco 2).
 */
export interface NewsItem {
  /** Título original da notícia. */
  title: string;
  /** Resumo/snippet curto fornecido pela fonte (não o artigo inteiro). */
  summary: string;
  /** URL original do item. */
  url: string;
  /** URL canônica (normalizada) — base para a deduplicação por URL (Bloco 2). */
  canonicalUrl: string;
  /** Nome da fonte (ex.: "Google News", "g1"). */
  source: string;
  /** Data de publicação. Fallback para o horário de coleta se a fonte não informar. */
  publishedAt: Date;
  /** URL de uma imagem associada, se houver. */
  imageUrl?: string;
  /**
   * Texto integral do artigo, extraído sob demanda (Bloco 2, enriquecimento) só
   * para os itens selecionados — insumo do LLM para um resumo melhor. Transiente
   * (não persistido). NUNCA republicado: o post é sempre reescrito (DEC-008).
   */
  content?: string;
  /**
   * Outras fontes que relataram a MESMA notícia nesta rodada, identificadas
   * pela dedup semântica (DEC-019 — `clusterByEmbedding`). Transiente (não
   * persistido, existe só durante o processamento da rodada). O prompt usa
   * isto para CONFIRMAR fatos que também aparecem no texto principal — nunca
   * para introduzir um fato ausente da fonte principal (preserva R1).
   */
  corroboratingSources?: { source: string; title: string; text: string }[];
  /**
   * Regras/exemplos recuperados da memória de alinhamento (DEC-020) mais
   * feedback corretivo de uma tentativa anterior (`AgenticRagProvider`).
   * Transiente — nunca persistido; existe só durante a geração.
   */
  learnedGuidance?: string[];
}

/**
 * Fronteira de I/O da coleta (DEC-005). Cada fonte (RSS, News API, ...) coleta
 * e normaliza para `NewsItem[]`. Coletores NÃO persistem nem decidem relevância
 * — só coletam e normalizam.
 */
export interface NewsSource {
  /** Identificador estável da fonte (para logs e diagnóstico). */
  readonly id: string;
  /** Tipo da fonte. */
  readonly kind: "rss" | "newsapi";
  /** Coleta e normaliza as notícias desta fonte. */
  collect(): Promise<NewsItem[]>;
}
