import { AppError } from "@/lib/errors";
import type { BrandProfile } from "@/lib/settings-schema";
import {
  buildSlideAssistPrompt,
  parseSlideAssist,
  SlideAssistError,
  type JsonCompleter,
  type SlideAssistInstruction,
  type SlideAssistResult,
} from "@/services/llm/slide-assist";
import { getDraftDetail } from "@/services/storage/draft-store";
import type { SlideContent } from "@/types";

/**
 * Sugere uma versão ajustada de UM slide de corpo (UI-34). Não grava nada —
 * o editor mostra a sugestão e o humano decide usar e salvar (DEC-011).
 * `index` é 1-based entre os slides de corpo; `current` permite ajustar o
 * estado ainda não salvo do editor.
 */
export async function assistSlide(
  id: string,
  index: number,
  instruction: SlideAssistInstruction,
  completer: JsonCompleter,
  current?: SlideContent,
  profile?: BrandProfile,
): Promise<SlideAssistResult> {
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
      "Só rascunhos pendentes podem ser ajustados.",
      409,
      "EDIT_ONLY_PENDING",
    );
  }
  const slide = current ?? detail.draft.slides[index - 1];
  if (!slide) {
    throw new AppError(`Slide ${index} não existe.`, 400, "SLIDE_OUT_OF_RANGE");
  }
  const reference = `${detail.summary ?? ""}\n${detail.draft.caption}`;
  const prompt = buildSlideAssistPrompt(slide, instruction, {
    title: detail.draft.shortTitle,
    source: detail.source,
    reference,
    ...(profile
      ? { niche: profile.niche, networkLabel: profile.networkLabel }
      : {}),
  });
  const text = await completer.completeJson(prompt);
  try {
    return parseSlideAssist(text, slide, reference);
  } catch (err) {
    if (err instanceof SlideAssistError) {
      throw new AppError(err.message, 422, "SLIDE_ASSIST_REJECTED");
    }
    throw err;
  }
}
