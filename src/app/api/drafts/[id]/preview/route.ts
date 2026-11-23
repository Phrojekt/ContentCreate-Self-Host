import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, toErrorResponse } from "@/lib/errors";
import {
  buildRendererFromSettings,
  buildDraftSlides,
  resolveFormat,
} from "@/services/publishing";
import { getEffectiveSettings } from "@/services/settings/settings-store";
import { getDraftDetail } from "@/services/storage/draft-store";

const querySchema = z.object({
  slide: z.coerce.number().int().min(1).default(1),
});

/**
 * Preview de UM slide do post (PNG) para a UI de revisão — UI-03.
 * `?slide=N` (1-based, default 1). Usa a MESMA montagem e o MESMO formato da
 * exportação (`buildDraftSlides` + `projectConfig.post.format`), com a
 * variante de cor da categoria: o que se vê aqui é o que será exportado.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const { slide } = querySchema.parse({
      slide: searchParams.get("slide") ?? undefined,
    });

    const detail = await getDraftDetail(id);
    if (!detail) {
      throw new AppError("Rascunho não encontrado.", 404, "DRAFT_NOT_FOUND");
    }

    const slides = buildDraftSlides(
      detail,
      (await getEffectiveSettings()).categories,
    );
    if (slide > slides.length) {
      throw new AppError(
        `Slide ${slide} fora do intervalo (1–${slides.length}).`,
        400,
        "SLIDE_OUT_OF_RANGE",
      );
    }

    const image = await (
      await buildRendererFromSettings()
    ).render(slides[slide - 1]!, {
      format: resolveFormat(),
    });

    return new NextResponse(new Uint8Array(image.buffer), {
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
