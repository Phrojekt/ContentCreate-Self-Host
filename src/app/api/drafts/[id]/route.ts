import { projectConfig } from "@config/project.config";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  REJECTION_NOTE_MAX,
  REJECTION_REASON_CODES,
} from "@/constants/rejection";
import { toErrorResponse } from "@/lib/errors";
import { getEffectiveSettings } from "@/services/settings/settings-store";
import { buildEmbeddingProvider } from "@/services/embedding";
import {
  approveAndExportDraft,
  buildDefaultPublisher,
  buildRendererFromSettings,
  draftEditSchema,
  editDraft,
  markDraftPublished,
  rejectDraft,
  restoreDraft,
} from "@/services/publishing";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("publish") }),
  z.object({ action: z.literal("restore") }),
  z.object({
    action: z.literal("reject"),
    reason: z.enum(REJECTION_REASON_CODES).optional(),
    note: z.string().trim().max(REJECTION_NOTE_MAX).optional(),
    learn: z.boolean().optional(),
  }),
]);

/** Embedder p/ gravar memória de feedback (DEC-020). Ausente/desligado → sem aprendizado por feedback. */
function buildFeedbackEmbedder() {
  return projectConfig.memory.enabled ? buildEmbeddingProvider() : undefined;
}

/** Ações da fila de revisão (humano no loop — DEC-011). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const { categories } = await getEffectiveSettings();

    switch (body.action) {
      case "approve": {
        const result = await approveAndExportDraft(id, {
          renderer: await buildRendererFromSettings(),
          publisher: buildDefaultPublisher(),
          embedder: buildFeedbackEmbedder(),
          categories,
        });
        return NextResponse.json({ ok: true, result });
      }
      case "reject":
        await rejectDraft(id, {
          embedder: buildFeedbackEmbedder(),
          categories,
          ...(body.reason ? { reason: body.reason } : {}),
          ...(body.note ? { note: body.note } : {}),
          ...(body.learn !== undefined ? { learn: body.learn } : {}),
        });
        return NextResponse.json({ ok: true });
      case "restore":
        await restoreDraft(id);
        return NextResponse.json({ ok: true });
      case "publish":
        await markDraftPublished(id);
        return NextResponse.json({ ok: true });
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Edição humana do conteúdo (UI-32) — só PENDING; mesmas garantias do LLM. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const edit = draftEditSchema.parse(await request.json());
    const { warnings } = await editDraft(id, edit);
    return NextResponse.json({ ok: true, warnings });
  } catch (error) {
    return toErrorResponse(error);
  }
}
