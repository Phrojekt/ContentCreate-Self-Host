import { z } from "zod";

import { EDIT_LIMITS } from "@/constants/editor";
import { CAROUSEL_MAX_SLIDES } from "@/constants/rendering";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { parseSlideContentArray } from "@/lib/slide-content";
import { sanitizeLlmOutput } from "@/services/llm/sanitize";
import {
  getDraftDetail,
  updateDraftContent,
} from "@/services/storage/draft-store";
import type { SlideContent } from "@/types";

/** Limite de legenda do Instagram. */
export const CAPTION_MAX = EDIT_LIMITS.caption;
/** Limite de hashtags do Instagram. */
export const HASHTAGS_MAX = EDIT_LIMITS.hashtags;

const L = EDIT_LIMITS;
const text = (max: number, what: string) =>
  z.string().max(max, `${what} passa de ${max} caracteres`);

export const slideSchema = z.object({
  lead: text(L.lead, "o gancho").default(""),
  body: z
    .string()
    .trim()
    .min(1, "o texto do slide não pode ficar vazio")
    .max(L.body, `o texto do slide passa de ${L.body} caracteres`),
  slideType: z
    .enum(["cover", "context", "stat", "comparison", "quote", "closing"])
    .optional(),
  eyebrow: text(L.eyebrow, "o rótulo").optional(),
  stat: z
    .object({
      value: text(L.statValue, "o número"),
      label: text(L.statLabel, "o rótulo do número"),
      supporting: text(L.statSupporting, "o apoio do número").optional(),
    })
    .optional(),
  comparison: z
    .object({
      leftLabel: text(L.cmpLabel, "o rótulo do lado A"),
      leftValue: text(L.cmpValue, "o valor do lado A"),
      leftDetail: text(L.cmpDetail, "o detalhe do lado A").optional(),
      rightLabel: text(L.cmpLabel, "o rótulo do lado B"),
      rightValue: text(L.cmpValue, "o valor do lado B"),
      rightDetail: text(L.cmpDetail, "o detalhe do lado B").optional(),
    })
    .optional(),
  quote: z
    .object({
      text: text(L.quoteText, "a citação"),
      author: text(L.quoteAuthor, "o autor"),
      role: text(L.quoteRole, "o cargo"),
    })
    .optional(),
});

/** Corpo do `PATCH /api/drafts/[id]` (UI-32). Todos os campos opcionais. */
export const draftEditSchema = z
  .object({
    shortTitle: z
      .string()
      .trim()
      .min(1, "o título não pode ficar vazio")
      .max(L.shortTitle, `o título passa de ${L.shortTitle} caracteres`),
    caption: z
      .string()
      .max(CAPTION_MAX, `a legenda passa de ${CAPTION_MAX} caracteres`),
    hashtags: z
      .array(z.string().max(L.hashtag))
      .max(HASHTAGS_MAX, `no máximo ${HASHTAGS_MAX} hashtags`),
    slides: z
      .array(slideSchema)
      .max(
        CAROUSEL_MAX_SLIDES - 1,
        `no máximo ${CAROUSEL_MAX_SLIDES - 1} slides de corpo`,
      ),
  })
  .partial();

export type DraftEdit = z.infer<typeof draftEditSchema>;

const blank = (v: string | undefined) => !v || !v.trim();

/** O slide tem todos os dados que o seu arquétipo exige? (puro) */
function isArchetypeComplete(s: SlideContent): boolean {
  if (s.slideType === "stat") {
    return !blank(s.stat?.value) && !blank(s.stat?.label);
  }
  if (s.slideType === "comparison") {
    return (
      !blank(s.comparison?.leftLabel) &&
      !blank(s.comparison?.leftValue) &&
      !blank(s.comparison?.rightLabel) &&
      !blank(s.comparison?.rightValue)
    );
  }
  if (s.slideType === "quote") {
    return (
      !blank(s.quote?.text) && !blank(s.quote?.author) && !blank(s.quote?.role)
    );
  }
  return true;
}

const ARCHETYPE_HINT: Record<string, string> = {
  stat: "número: preencha o número e o rótulo",
  comparison: "comparação: preencha os dois lados (rótulo e valor)",
  quote: "citação: preencha a frase, o autor e o cargo",
};

/**
 * Normaliza arquétipos incompletos (função pura). O LLM às vezes marca um
 * slide como número/comparação/citação sem os dados — o template já o desenha
 * como "contexto". Em vez de recusar o salvamento (o que travava a edição
 * desses rascunhos), o slide é gravado como "contexto", sem os dados
 * parciais, e volta um aviso. Quando o humano completa os campos, o
 * arquétipo passa a valer.
 */
export function normalizeArchetypes(slides: SlideContent[]): {
  slides: SlideContent[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const out = slides.map((s, i) => {
    if (isArchetypeComplete(s)) return s;
    warnings.push(
      `Slide ${i + 2} (${ARCHETYPE_HINT[s.slideType ?? ""]}) — até lá ele aparece como contexto.`,
    );
    const rest: SlideContent = { ...s, slideType: "context" };
    delete rest.stat;
    delete rest.comparison;
    delete rest.quote;
    return rest;
  });
  return { slides: out, warnings };
}

/** Mensagens dos arquétipos incompletos (ver `normalizeArchetypes`). */
export function archetypeErrors(slides: SlideContent[]): string[] {
  return normalizeArchetypes(slides).warnings;
}

export interface EditResult {
  /** Avisos não bloqueantes (ex.: arquétipo incompleto gravado como contexto). */
  warnings: string[];
}

/**
 * Edita o conteúdo de um rascunho PENDING (UI-32), com as MESMAS garantias da
 * saída do LLM: `parseSlideContentArray` + `sanitizeLlmOutput` (sem HTML,
 * hashtags normalizadas, sem placeholders) e normalização por arquétipo.
 * Grava `editedAt`. Não aprova nada — aprovar continua sendo ação separada.
 */
export async function editDraft(
  id: string,
  edit: DraftEdit,
  now: Date = new Date(),
): Promise<EditResult> {
  const detail = await getDraftDetail(id);
  if (!detail) {
    throw new AppError(
      `Rascunho ${id} não encontrado.`,
      404,
      "DRAFT_NOT_FOUND",
    );
  }
  if (detail.draft.status !== "PENDING") {
    throw new AppError(
      "Só rascunhos pendentes podem ser editados.",
      409,
      "EDIT_ONLY_PENDING",
    );
  }

  const slidesIn =
    edit.slides !== undefined
      ? parseSlideContentArray(edit.slides)
      : detail.draft.slides;

  const clean = sanitizeLlmOutput({
    shortTitle: edit.shortTitle ?? detail.draft.shortTitle,
    caption: edit.caption ?? detail.draft.caption,
    hashtags: edit.hashtags ?? detail.draft.hashtags,
    slides: slidesIn,
  });

  if (!clean.shortTitle.trim()) {
    throw new AppError("O título não pode ficar vazio.", 400, "INVALID_EDIT");
  }
  const sanitized = clean.slides ?? [];
  if (edit.slides !== undefined && sanitized.length !== edit.slides.length) {
    throw new AppError(
      "Algum slide ficou sem texto aproveitável (vazio, só marcação ou texto-modelo).",
      400,
      "INVALID_EDIT",
    );
  }
  const { slides, warnings } = normalizeArchetypes(sanitized);

  const saved = await updateDraftContent(
    id,
    {
      ...(edit.shortTitle !== undefined
        ? { shortTitle: clean.shortTitle }
        : {}),
      ...(edit.caption !== undefined ? { caption: clean.caption } : {}),
      ...(edit.hashtags !== undefined ? { hashtags: clean.hashtags } : {}),
      ...(edit.slides !== undefined ? { slides } : {}),
    },
    now,
  );
  if (!saved) {
    throw new AppError(
      "O rascunho mudou de status enquanto você editava.",
      409,
      "EDIT_ONLY_PENDING",
    );
  }
  logger.info(
    { draftId: id, warnings: warnings.length },
    "Rascunho editado por humano",
  );
  return { warnings };
}
