/**
 * Deriva quantos slides pedir ao LLM e o tamanho da legenda a partir do
 * tamanho do conteúdo disponível (artigo integral > resumo).
 *
 * Por quê: com um range fixo ("3 a 5 slides"), o modelo local (qwen2.5) ancorava
 * sempre no mínimo — carrosséis de notícia de 10k caracteres saíam com o mesmo
 * número de slides que um resumo de 400 — e a legenda nunca passava de 2-3
 * frases mesmo quando a instrução pedia 4-6. Em vez de uma faixa vaga, calcula
 * um alvo EXATO por faixa de tamanho de texto: mais conteúdo-fonte sustenta mais
 * fatos concretos (sem alucinar) e justifica um carrossel maior.
 */

export type ContentTier =
  | "limited"
  | "medium"
  | "rich"
  | "extensive"
  | "maximum";

export interface ContentTarget {
  tier: ContentTier;
  /** Quantidade de slides de CORPO pedida ao LLM (a capa é sempre +1, fora daqui). */
  slideCount: number;
  minWordsPerSlide: number;
  maxWordsPerSlide: number;
  /** Faixa de frases pedida para a legenda. */
  captionSentences: { min: number; max: number };
  /** Piso de caracteres da legenda — força elaborar em vez de só "bater a faixa". */
  captionMinChars: number;
}

interface TierRule {
  /** Tamanho mínimo de conteúdo (chars) para este tier valer. */
  minChars: number;
  target: ContentTarget;
}

/**
 * Ordenado ascendente por `minChars`. O gate de conteúdo (`content-gate.ts`)
 * já descarta itens abaixo de `MIN_CONTENT_CHARS` (300) antes de chegar aqui —
 * por isso o tier "limited" cobre, na prática, 300-899 chars.
 *
 * `slideCount` + 1 (capa) nunca passa de 10 — limite do Instagram
 * (`CAROUSEL_MAX_SLIDES`).
 */
const TIERS: readonly TierRule[] = [
  {
    minChars: 0,
    target: {
      tier: "limited",
      slideCount: 2,
      // Conteúdo magro: 2 frases sólidas por slide (~20-40 palavras)
      minWordsPerSlide: 20,
      maxWordsPerSlide: 40,
      captionSentences: { min: 3, max: 4 },
      captionMinChars: 220,
    },
  },
  {
    minChars: 900,
    target: {
      tier: "medium",
      slideCount: 4,
      // Conteúdo médio: 2-3 frases por slide (~30-55 palavras)
      minWordsPerSlide: 30,
      maxWordsPerSlide: 55,
      captionSentences: { min: 4, max: 6 },
      captionMinChars: 380,
    },
  },
  {
    minChars: 2000,
    target: {
      tier: "rich",
      slideCount: 6,
      // Conteúdo rico: 2-4 frases por slide (~35-60 palavras)
      minWordsPerSlide: 35,
      maxWordsPerSlide: 60,
      captionSentences: { min: 5, max: 7 },
      captionMinChars: 550,
    },
  },
  {
    minChars: 4000,
    target: {
      tier: "extensive",
      slideCount: 8,
      // Conteúdo extenso: 3-4 frases por slide (~40-65 palavras)
      minWordsPerSlide: 40,
      maxWordsPerSlide: 65,
      captionSentences: { min: 6, max: 8 },
      captionMinChars: 700,
    },
  },
  {
    minChars: 7000,
    target: {
      tier: "maximum",
      slideCount: 9,
      // Conteúdo máximo: 3-4 frases por slide (~40-70 palavras)
      minWordsPerSlide: 40,
      maxWordsPerSlide: 70,
      captionSentences: { min: 7, max: 9 },
      captionMinChars: 850,
    },
  },
];

/** Tier mais alto cujo `minChars` o conteúdo atinge (monotônico em `contentChars`). */
export function computeContentTarget(contentChars: number): ContentTarget {
  let chosen = TIERS[0]!.target;
  for (const rule of TIERS) {
    if (contentChars >= rule.minChars) chosen = rule.target;
  }
  return chosen;
}
