import {
  CAROUSEL_MAX_SLIDES,
  SLIDE_BODY_MAX_CHARS,
} from "@/constants/rendering";
import type { PostData, SlideContent, TemplateVariant } from "@/types";

export interface BuildSlidesInput {
  /** Manchete — vira a CAPA do carrossel. */
  shortTitle: string;
  /** Legenda completa — fonte do conteúdo dos slides de corpo (fallback). */
  caption: string;
  /** Slides (gancho + parágrafo) vindos do LLM (preferidos quando presentes). */
  slides?: SlideContent[];
  sourceCredit: string;
  date: string;
  /** Imagem de fundo — aplicada só na CAPA (corpo usa fundo sólido p/ leitura). */
  backgroundImageUrl?: string;
  /** Variante de template selecionada pelo conteúdo (propagada para todos os slides). */
  variant?: TemplateVariant;
  /** Hashtags exibidas no último slide como chips. */
  hashtags?: string[];
}

export interface BuildSlidesOptions {
  /** Total máximo de slides, incluindo a capa (default: limite do Instagram). */
  maxSlides?: number;
}

/** Remove o crédito "Fonte: X" do fim da legenda (o rodapé já credita). */
function stripSourceCredit(caption: string): string {
  return caption.replace(/\s*Fonte:\s*[\s\S]+$/i, "").trim();
}

/**
 * Extrai a primeira frase da legenda como teaser para a capa.
 * Trunca em 180 chars para não sobrecarregar o layout.
 */
function extractTeaser(caption: string): string {
  const text = stripSourceCredit(caption);
  const match = text.match(/^[^.!?]+[.!?]*/);
  const sentence = (match?.[0] ?? "").trim();
  return sentence.length > 180 ? `${sentence.slice(0, 177)}…` : sentence;
}

/** Divide um texto em blocos por frases, sem ultrapassar `maxChars` por bloco. */
export function chunkText(text: string, maxChars: number): string[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return [];

  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (!current) {
      current = sentence;
    } else if (`${current} ${sentence}`.length <= maxChars) {
      current = `${current} ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Monta os slides de um carrossel a partir do conteúdo de um rascunho.
 *
 * - Slide 1: CAPA (manchete + imagem de fundo, se houver).
 * - Slides 2..N: CORPO — usa `slides` do LLM se vierem; senão divide a legenda.
 * - Sem conteúdo de corpo → retorna só a capa (post único, sem contador).
 *
 * Função pura e testável (separação conteúdo/layout — DEC-009). Respeita o
 * limite do Instagram e o `maxSlides` da configuração.
 */
export function buildCarouselSlides(
  input: BuildSlidesInput,
  options: BuildSlidesOptions = {},
): PostData[] {
  const maxSlides = Math.min(
    options.maxSlides ?? CAROUSEL_MAX_SLIDES,
    CAROUSEL_MAX_SLIDES,
  );

  const fromLlm = (input.slides ?? []).filter((s) => s.body.trim().length > 0);
  // Sem slides do LLM → divide a legenda em parágrafos (sem gancho).
  const bodyContent: SlideContent[] =
    fromLlm.length > 0
      ? fromLlm
      : chunkText(stripSourceCredit(input.caption), SLIDE_BODY_MAX_CHARS).map(
          (body) => ({ lead: "", body }),
        );

  // Reserva 1 slide para a capa.
  const bodies = bodyContent.slice(0, Math.max(0, maxSlides - 1));
  const total = 1 + bodies.length;

  const variantProp = input.variant ? { variant: input.variant } : {};
  const teaser = extractTeaser(input.caption);
  const hashtagsProp =
    input.hashtags && input.hashtags.length > 0
      ? { hashtags: input.hashtags }
      : {};

  const cover: PostData = {
    shortTitle: input.shortTitle,
    sourceCredit: input.sourceCredit,
    date: input.date,
    ...variantProp,
    ...(teaser ? { teaser } : {}),
    // Hashtags aparecem na capa se for post único (total === 1).
    ...(total === 1 ? hashtagsProp : {}),
    ...(input.backgroundImageUrl
      ? { backgroundImageUrl: input.backgroundImageUrl }
      : {}),
    ...(total > 1 ? { position: { index: 1, total } } : {}),
  };

  if (total === 1) return [cover];

  const bodySlides: PostData[] = bodies.map((slide, i) => ({
    shortTitle: input.shortTitle,
    body: slide.body,
    ...(slide.lead.trim() ? { lead: slide.lead.trim() } : {}),
    sourceCredit: input.sourceCredit,
    date: input.date,
    ...variantProp,
    // Campos de arquétipo (brand guide sec 6) — o template escolhe o layout.
    ...(slide.slideType ? { slideType: slide.slideType } : {}),
    ...(slide.eyebrow?.trim() ? { eyebrow: slide.eyebrow.trim() } : {}),
    ...(slide.stat ? { stat: slide.stat } : {}),
    ...(slide.comparison ? { comparison: slide.comparison } : {}),
    ...(slide.quote ? { quote: slide.quote } : {}),
    // Hashtags apenas no último slide.
    ...(i === bodies.length - 1 ? hashtagsProp : {}),
    position: { index: i + 2, total },
  }));

  return [cover, ...bodySlides];
}
