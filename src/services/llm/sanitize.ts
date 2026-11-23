import type { SlideContent } from "@/types";
import type { LlmOutput } from "./llm-provider";

/**
 * Remove tags HTML e colapsa espaços horizontais, preservando quebras de linha.
 * LLMs às vezes devolvem `<a href>` ou `<b>` na legenda — Instagram não renderiza.
 */
export function stripHtml(text: string): string {
  return text
    .replace(/<\/?[a-zA-Z][^>]*>/g, "") // tags HTML completas (<a ...>, </b>)
    .replace(/<\/?[a-zA-Z][^>]*$/g, "") // tag truncada no fim, sem o '>'
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/**
 * Normaliza uma hashtag para o formato do Instagram: sem '#', sem espaços, só
 * letras (com acento), números e '_'. "PUC Campinas" → "PUCCampinas".
 * Retorna "" se não sobrar nada utilizável (filtrado pelo chamador).
 */
export function sanitizeHashtag(raw: string): string {
  return raw
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_ ]/gu, "") // descarta pontuação/símbolos
    .replace(/\s+/g, "") // junta palavras (hashtag não tem espaço)
    .trim();
}

/**
 * Remove hashtags soltas da legenda (o modelo às vezes repete as #s no fim do
 * texto). Hashtags têm campo próprio — a descrição é só prosa. Limpa também o
 * espaçamento e pontuação órfã que sobra.
 */
export function stripHashtagsFromCaption(caption: string): string {
  return caption
    .replace(/(?:^|\s)#[\p{L}\p{N}_]+/gu, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([.!?])/g, "$1")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

/** Detecta texto-placeholder que o modelo às vezes copia do prompt de exemplo. */
function isPlaceholder(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /^slide\b/.test(t) || // "Slide", "Slide 1" (não pega "Slides ...")
    /^hashtag\d/.test(t) || // "hashtag1"
    /^(texto|frase)\s+(do|de)\b/.test(t) || // "Texto do slide", "Frase de exemplo"
    t.includes("lorem ipsum")
  );
}

/** Limpa um trecho de slide: remove HTML e hashtags soltas, normaliza espaços. */
function cleanSlideText(text: string): string {
  return stripHtml(text)
    .replace(/(?:^|\s)#[\p{L}\p{N}_]+/gu, "")
    .trim();
}

/**
 * Limpa os slides (gancho + parágrafo): remove HTML e hashtags soltas de `lead`
 * e `body`, descarta slides sem corpo aproveitável ou com texto-placeholder
 * (ex.: "Slide 1", "Texto do slide"). Um `lead` placeholder/vazio é zerado mas
 * o slide é mantido se o `body` for válido (o template renderiza só o parágrafo).
 */
export function sanitizeSlides(
  slides: SlideContent[] | undefined,
): SlideContent[] {
  if (!slides) return [];
  const cleaned: SlideContent[] = [];
  for (const slide of slides) {
    const body = cleanSlideText(slide.body ?? "");
    if (body.length === 0 || isPlaceholder(body)) continue;
    const leadRaw = cleanSlideText(slide.lead ?? "");
    const lead = leadRaw.length > 0 && !isPlaceholder(leadRaw) ? leadRaw : "";
    const result: SlideContent = { lead, body };

    if (slide.slideType) result.slideType = slide.slideType;

    const eyebrow = stripHtml(slide.eyebrow ?? "").trim();
    if (eyebrow) result.eyebrow = eyebrow;

    if (slide.stat) {
      result.stat = {
        value: stripHtml(slide.stat.value ?? "").trim(),
        label: stripHtml(slide.stat.label ?? "").trim(),
        ...(slide.stat.supporting
          ? { supporting: stripHtml(slide.stat.supporting).trim() }
          : {}),
      };
    }

    if (slide.comparison) {
      result.comparison = {
        leftLabel: stripHtml(slide.comparison.leftLabel ?? "").trim(),
        leftValue: stripHtml(slide.comparison.leftValue ?? "").trim(),
        ...(slide.comparison.leftDetail
          ? { leftDetail: stripHtml(slide.comparison.leftDetail).trim() }
          : {}),
        rightLabel: stripHtml(slide.comparison.rightLabel ?? "").trim(),
        rightValue: stripHtml(slide.comparison.rightValue ?? "").trim(),
        ...(slide.comparison.rightDetail
          ? { rightDetail: stripHtml(slide.comparison.rightDetail).trim() }
          : {}),
      };
    }

    if (slide.quote) {
      result.quote = {
        text: stripHtml(slide.quote.text ?? "").trim(),
        author: stripHtml(slide.quote.author ?? "").trim(),
        role: stripHtml(slide.quote.role ?? "").trim(),
      };
    }

    cleaned.push(result);
  }
  return cleaned;
}

/**
 * Limpa a saída do LLM para uso direto no Instagram: legenda sem HTML, título
 * sem HTML, hashtags normalizadas e sem vazias/duplicadas, slides higienizados.
 */
export function sanitizeLlmOutput(output: LlmOutput): LlmOutput {
  const seen = new Set<string>();
  const hashtags: string[] = [];
  for (const raw of output.hashtags) {
    const tag = sanitizeHashtag(raw);
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      hashtags.push(tag);
    }
  }

  return {
    shortTitle: stripHtml(output.shortTitle),
    caption: stripHashtagsFromCaption(stripHtml(output.caption)),
    hashtags,
    slides: sanitizeSlides(output.slides),
  };
}
