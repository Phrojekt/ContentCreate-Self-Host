import { NextResponse } from "next/server";

import { AppError, toErrorResponse } from "@/lib/errors";
import { buildDraftSlides, resolveFormat } from "@/services/publishing";
import { getEffectiveSettings } from "@/services/settings/settings-store";
import { getDraftDetail } from "@/services/storage/draft-store";

/**
 * Metadados da tira de slides (UI-03): quantos slides, arquétipo de cada um,
 * variante de cor e formato de exportação. Mesma montagem do preview/exportado.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const detail = await getDraftDetail(id);
    if (!detail) {
      throw new AppError("Rascunho não encontrado.", 404, "DRAFT_NOT_FOUND");
    }
    const slides = buildDraftSlides(
      detail,
      (await getEffectiveSettings()).categories,
    );
    return NextResponse.json({
      total: slides.length,
      format: resolveFormat(),
      variant: slides[0]?.variant ?? "default",
      slides: slides.map((s, i) => ({
        index: i + 1,
        slideType: s.slideType ?? (i === 0 ? "cover" : "context"),
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
