import type { KeywordsConfig } from "@config/keywords";
import type { NewsItem } from "@/types";

/** Escapa caracteres especiais de regex num literal. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compila uma keyword em regex de PALAVRA INTEIRA (unicode). Evita o falso
 * positivo de substring: "ia" NÃO casa dentro de "notícia"/"família"; "bi" não
 * casa em "combinação". Frases ("inteligência artificial") casam com fronteira
 * só nas pontas.
 */
function toWordRegex(keyword: string): RegExp | null {
  const kw = keyword.trim();
  if (!kw) return null;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegex(kw)}(?![\\p{L}\\p{N}])`,
    "iu",
  );
}

function compile(keywords: string[]): RegExp[] {
  return keywords.map(toWordRegex).filter((re): re is RegExp => re !== null);
}

/**
 * Filtro de relevância por palavras-chave (função pura).
 *
 * - `blocked`: qualquer ocorrência (palavra inteira) descarta a notícia.
 * - `required`: ao menos uma deve aparecer; lista vazia deixa tudo passar.
 *
 * Busca por palavra inteira, case-insensitive, no título + resumo concatenados.
 */
export function filterByKeywords(
  items: NewsItem[],
  config: KeywordsConfig,
): NewsItem[] {
  const blocked = compile(config.blocked);
  const required = compile(config.required);

  return items.filter((item) => {
    const text = `${item.title} ${item.summary}`;

    if (blocked.some((re) => re.test(text))) return false;
    if (required.length === 0) return true;
    return required.some((re) => re.test(text));
  });
}
