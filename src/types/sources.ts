// Contratos de CONFIGURAÇÃO das fontes de coleta.
// O código (genérico) vive em src/; os DADOS por nicho vivem em config/sources.ts.

/** Provedores de News API suportados pelo adapter provider-agnóstico. */
export type NewsApiProvider = "newsapi" | "gnews" | "newsdata";

/** Configuração de um feed RSS. */
export type RssFeedConfig = {
  id: string;
  url: string;
  /** Nome da fonte usado no `NewsItem.source` (RSS nem sempre traz a origem). */
  sourceName: string;
};

/** Configuração de uma query de News API. */
export type NewsApiQueryConfig = {
  id: string;
  query: string;
  /** Código de idioma do provedor (ex.: "pt", "en"). */
  language: string;
  provider: NewsApiProvider;
};
