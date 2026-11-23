/**
 * Detecção heurística de cópia literal da fonte (R2 — "zero cópia do
 * original"). Núcleo puro e testável: compara o texto GERADO contra o
 * texto-fonte por sobreposição de shingles (janelas de N palavras
 * consecutivas) — a mesma técnica clássica de detecção de quase-duplicatas.
 * Uma fração alta de shingles do texto gerado que também aparecem
 * literalmente na fonte é sinal de paráfrase superficial em vez de reescrita
 * editorial de verdade.
 */
const SHINGLE_SIZE = 8;

function normalizeForShingles(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shingles(text: string, n: number): Set<string> {
  const words = normalizeForShingles(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) {
    out.add(words.slice(i, i + n).join(" "));
  }
  return out;
}

/**
 * Fração dos shingles de `n` palavras do texto gerado que também aparecem
 * literalmente no texto-fonte. 0 = nenhuma sobreposição (reescrita real);
 * próximo de 1 = o texto gerado é essencialmente cópia da fonte.
 */
export function copyOverlapRatio(
  generated: string,
  source: string,
  n: number = SHINGLE_SIZE,
): number {
  const genShingles = shingles(generated, n);
  if (genShingles.size === 0) return 0;
  const srcShingles = shingles(source, n);
  if (srcShingles.size === 0) return 0;

  let matches = 0;
  for (const shingle of genShingles) {
    if (srcShingles.has(shingle)) matches++;
  }
  return matches / genShingles.size;
}
