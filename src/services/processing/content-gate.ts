import type { NewsItem } from "@/types";

/**
 * Piso de conteúdo: abaixo disso o item é descartado ANTES do LLM.
 *
 * Por quê: artigos "magros" (resumo de 1–2 frases, sem corpo extraível) não dão
 * fatos concretos suficientes — o LLM tende a preencher as lacunas com dados de
 * treinamento (alucinação). Melhor não gerar rascunho do que gerar um inventado.
 *
 * Este gate roda DEPOIS do enriquecimento (leitura do artigo integral): um resumo
 * curto pode virar texto rico após a extração. Só descarta o que continua magro
 * mesmo com a melhor extração possível.
 */
export const MIN_CONTENT_CHARS = 300;

/** Tamanho do melhor texto disponível do item (artigo integral > resumo). */
export function contentLength(item: NewsItem): number {
  return (item.content ?? item.summary).trim().length;
}

/** `true` se o item tem texto suficiente para gerar conteúdo factual. */
export function hasEnoughContent(
  item: NewsItem,
  minChars: number = MIN_CONTENT_CHARS,
): boolean {
  return contentLength(item) >= minChars;
}
