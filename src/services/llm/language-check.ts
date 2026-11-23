/**
 * Detecção heurística de vazamento de idioma (R0 — DEC-016). Núcleo puro e
 * testável: sem I/O, sem chamada de LLM. As palavras abaixo são praticamente
 * exclusivas do inglês (não existem como palavra em português) — presença
 * recorrente é sinal forte de que o texto não foi (todo) reescrito em PT-BR.
 *
 * Não tenta ser um detector de idioma geral — é um gate específico contra o
 * modo de falha observado em produção: o LLM copia um trecho da fonte (em
 * inglês) ou deixa uma citação sem traduzir, apesar de R0 mandar tudo em PT-BR.
 */
const STRONG_ENGLISH_WORDS = [
  "the",
  "and",
  "with",
  "this",
  "that",
  "from",
  "have",
  "been",
  "were",
  "their",
  "about",
  "which",
  "will",
  "would",
  "could",
  "into",
  "some",
  "such",
  "other",
  "these",
  "those",
  "what",
  "your",
  "they",
  "when",
  "where",
  "because",
  "however",
  "according",
  "announced",
  "released",
  "researchers",
  "company",
] as const;

/** Conta ocorrências de palavras fortemente inglesas (fronteira de palavra, case-insensitive). */
export function countEnglishMarkers(text: string): number {
  const normalized = text.toLowerCase();
  let count = 0;
  for (const word of STRONG_ENGLISH_WORDS) {
    const matches = normalized.match(new RegExp(`\\b${word}\\b`, "g"));
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * `true` quando a proporção de marcadores ingleses sobre o total de palavras
 * é alta o bastante para não ser ruído (nome próprio, sigla, etc.). Textos
 * curtos (< 6 palavras) não são avaliados — heurística de proporção não é
 * confiável em amostra pequena.
 */
export function looksLikeEnglish(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 6) return false;
  const hits = countEnglishMarkers(text);
  return hits / words.length >= 0.08;
}
