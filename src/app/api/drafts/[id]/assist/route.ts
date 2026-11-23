import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "@/lib/errors";
import { brandProfileOf } from "@/lib/settings-schema";
import { SLIDE_ASSIST_INSTRUCTIONS } from "@/services/llm/slide-assist";
import { buildSlideCompleter } from "@/services/orchestration";
import { assistSlide, slideSchema } from "@/services/publishing";
import { getEffectiveSettings } from "@/services/settings/settings-store";

const bodySchema = z.object({
  /** Slide de corpo, 1-based. */
  index: z.number().int().min(1).max(9),
  instruction: z.enum(
    Object.keys(SLIDE_ASSIST_INSTRUCTIONS) as [
      keyof typeof SLIDE_ASSIST_INSTRUCTIONS,
      ...(keyof typeof SLIDE_ASSIST_INSTRUCTIONS)[],
    ],
  ),
  /** Estado atual (ainda não salvo) do slide no editor. */
  slide: slideSchema.optional(),
});

/**
 * Sugestão do assistente para UM slide (UI-34). Não grava — devolve a
 * sugestão; o humano decide usar e salvar no editor (DEC-011).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const profile = brandProfileOf(await getEffectiveSettings());
    const result = await assistSlide(
      id,
      body.index,
      body.instruction,
      buildSlideCompleter(profile),
      body.slide,
      profile,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
