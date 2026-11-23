// Barrel + composition root do Bloco 4 (Publicação).
import { DEFAULT_OUTPUT_DIR } from "@/constants/publishing";
import { env } from "@/lib/env";
import { SatoriRenderer } from "@/services/rendering";
import { themesFromSettings } from "@/lib/settings-schema";
import { getEffectiveSettings } from "@/services/settings/settings-store";
import type {
  PostRenderer,
  Publisher,
  RenderTheme,
  TemplateVariant,
} from "@/types";
import { SchedulerPublisher } from "./scheduler-publisher";

export { SchedulerPublisher } from "./scheduler-publisher";
export {
  EXPORTED_FILE_RE,
  isSafeExportPath,
  listExportedFiles,
  readExportedFile,
} from "./exported-files";
export type { SchedulerPublisherOptions } from "./scheduler-publisher";
export { decisionFields, nextStatus } from "./status";
export {
  archetypeErrors,
  CAPTION_MAX,
  draftEditSchema,
  editDraft,
  HASHTAGS_MAX,
  normalizeArchetypes,
  slideSchema,
} from "./edit-draft";
export { assistSlide } from "./assist-slide";
export type { DraftEdit, EditResult } from "./edit-draft";
export type { DraftAction } from "./status";
export {
  approveAndExportDraft,
  buildDraftSlides,
  resolveFormat,
  previewDraft,
  rejectDraft,
  restoreDraft,
  restoreDrafts,
  deleteRejectedDrafts,
  purgeExpiredRejected,
  shouldLearnFromRejection,
  markDraftPublished,
} from "./publish-draft";
export type { DeleteDeps, PublishDeps, RejectOptions } from "./publish-draft";

/** Pasta-raiz de saída do agendador (mesma do publisher default). */
export function outputDir(): string {
  return env.PUBLISH_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
}

/** Publisher default (4A): entrega na pasta de `PUBLISH_OUTPUT_DIR` ou padrão. */
export function buildDefaultPublisher(): Publisher {
  return new SchedulerPublisher({
    outDir: outputDir(),
  });
}

/** Renderer default (Bloco 3) — temas de `config/` ou os passados. */
export function buildDefaultRenderer(
  themes?: Record<TemplateVariant, RenderTheme>,
): PostRenderer {
  return new SatoriRenderer(themes ? { themes } : {});
}

/** Renderer com as cores e a marca salvas na UI (DEC-027). */
export async function buildRendererFromSettings(): Promise<PostRenderer> {
  return buildDefaultRenderer(themesFromSettings(await getEffectiveSettings()));
}
