import { rm } from "node:fs/promises";
import { join } from "node:path";

import { projectConfig } from "@config/project.config";
import {
  REASONS_WITHOUT_LESSON,
  type RejectionReason,
} from "@/constants/rejection";
import {
  classifyCategory,
  defaultCategories,
  type CategoriesConfig,
} from "@/lib/categories";
import { AppError } from "@/lib/errors";
import { retentionCutoff } from "@/lib/retention";
import { logger } from "@/lib/logger";
import type { EmbeddingProvider } from "@/services/embedding";
import {
  deactivateRejectedLessons,
  recordApprovedExample,
  recordRejectedLesson,
  type RejectionInput,
} from "@/services/memory";
import {
  buildCarouselSlides,
  buildPostData,
  renderPostPackage,
} from "@/services/rendering";
import {
  deleteRejectedDraftRecords,
  getDraftDetail,
  getDraftStatuses,
  listRejectedDecidedBefore,
  updateDraftStatus,
  type DraftDetail,
} from "@/services/storage/draft-store";
import type {
  PostData,
  PostFormat,
  PostRenderer,
  Publisher,
  PublishResult,
} from "@/types";
import { SAFE_DRAFT_ID_RE } from "./exported-files";
import { decisionFields, nextStatus } from "./status";

export interface PublishDeps {
  renderer: PostRenderer;
  publisher: Publisher;
  format?: PostFormat;
  /** Recall/gravação de memória de alinhamento (DEC-020). Ausente → sem aprendizado por feedback. */
  embedder?: EmbeddingProvider;
  /** Categorias configuradas na Identidade (DEC-028). Default: de fábrica. */
  categories?: CategoriesConfig;
}

/**
 * Grava um sinal de memória a partir da decisão humana, sem NUNCA bloquear a
 * ação (aprovar/rejeitar) por causa de uma falha de embedding/banco — mesma
 * filosofia fail-safe do notifier em `orchestrator.ts`.
 */
async function recordFeedbackMemory(
  kind: "approved" | "rejected",
  embedder: EmbeddingProvider | undefined,
  detail: DraftDetail,
  draftId: string,
  rejection?: RejectionInput,
  categories?: CategoriesConfig,
): Promise<void> {
  if (!embedder) return;
  const category = categories
    ? classifyCategory(
        detail.draft.shortTitle,
        detail.draft.caption,
        categories,
      )
    : undefined;
  try {
    if (kind === "approved") {
      await (category === undefined
        ? recordApprovedExample(embedder, detail, draftId)
        : recordApprovedExample(embedder, detail, draftId, category));
    } else {
      await (category === undefined
        ? recordRejectedLesson(embedder, detail, draftId, rejection)
        : recordRejectedLesson(embedder, detail, draftId, rejection, category));
    }
  } catch (err) {
    logger.warn(
      { err, draftId, kind },
      "Falha ao gravar memória de feedback (best-effort, não bloqueia a ação)",
    );
  }
}

async function loadOrThrow(id: string): Promise<DraftDetail> {
  const detail = await getDraftDetail(id);
  if (!detail) {
    throw new AppError(
      `Rascunho ${id} não encontrado.`,
      404,
      "DRAFT_NOT_FOUND",
    );
  }
  return detail;
}

/**
 * Monta os slides (`PostData[]`) do rascunho — capa + corpo quando o carrossel
 * está habilitado, senão post único — com a variante de cor da categoria.
 * Função SEM efeito colateral: é a fonte única da montagem, usada tanto pela
 * exportação (`buildPackage`) quanto pelo preview da UI (UI-03), garantindo
 * preview = exportado. Usa a foto da notícia como fundo da capa quando existe.
 */
export function buildDraftSlides(
  detail: DraftDetail,
  /** Categorias configuradas (DEC-028). Default: de fábrica. */
  categories: CategoriesConfig = defaultCategories(),
): PostData[] {
  const { carousel } = projectConfig.post;
  const variant = classifyCategory(
    detail.draft.shortTitle,
    detail.draft.caption,
    categories,
  );

  const base = buildPostData({
    shortTitle: detail.draft.shortTitle,
    sourceCredit: detail.source,
    date: detail.publishedAt,
    ...(detail.imageUrl ? { backgroundImageUrl: detail.imageUrl } : {}),
  });

  return carousel.enabled
    ? buildCarouselSlides(
        {
          shortTitle: detail.draft.shortTitle,
          caption: detail.draft.caption,
          slides: detail.draft.slides,
          hashtags: detail.draft.hashtags,
          sourceCredit: detail.source,
          date: base.date, // já formatada por buildPostData
          variant,
          ...(base.backgroundImageUrl
            ? { backgroundImageUrl: base.backgroundImageUrl }
            : {}),
        },
        { maxSlides: carousel.maxSlides },
      )
    : [{ ...base, variant, hashtags: detail.draft.hashtags }];
}

/** Formato de exportação efetivo (deps > config). */
export function resolveFormat(format?: PostFormat): PostFormat {
  return format ?? projectConfig.post.format;
}

/**
 * Monta o `PostPackage` (imagem(ns) + legenda + hashtags) a partir do detalhe
 * do rascunho. Reutilizado por preview em disco e aprovação — só o efeito
 * colateral muda.
 */
async function buildPackage(detail: DraftDetail, deps: PublishDeps) {
  return renderPostPackage(
    deps.renderer,
    buildDraftSlides(detail, deps.categories),
    {
      caption: detail.draft.caption,
      hashtags: detail.draft.hashtags,
      format: resolveFormat(deps.format),
    },
  );
}

/**
 * Aprova um rascunho PENDING: renderiza a imagem, entrega o pacote via
 * `Publisher` (4A) e só então marca como APPROVED. Se a renderização/entrega
 * falhar, o status permanece PENDING (permite repetir). Nada vai ao ar sozinho.
 */
export async function approveAndExportDraft(
  id: string,
  deps: PublishDeps,
): Promise<PublishResult> {
  const detail = await loadOrThrow(id);
  const status = nextStatus(detail.draft.status, "approve"); // valida transição

  const pkg = await buildPackage(detail, deps);

  const result = await deps.publisher.publish(pkg, { draftId: id });
  await updateDraftStatus(id, status, decisionFields(status, new Date()));
  // Em segundo plano: o embedding pode levar dezenas de segundos (modelo do
  // Ollama carregando) e não deve segurar a fila de revisão. Já é fail-safe.
  void recordFeedbackMemory(
    "approved",
    deps.embedder,
    detail,
    id,
    undefined,
    deps.categories,
  );

  logger.info(
    { draftId: id, location: result.location },
    "Rascunho aprovado e exportado",
  );
  return result;
}

/**
 * Renderiza e exporta um rascunho para inspeção visual SEM alterar o status
 * (continua PENDING). Não publica nada, não aprova — só materializa o post
 * (imagem + legenda) no disco para o humano ver o resultado (DEC-011).
 */
export async function previewDraft(
  id: string,
  deps: PublishDeps,
): Promise<PublishResult> {
  const detail = await loadOrThrow(id);
  const pkg = await buildPackage(detail, deps);
  const result = await deps.publisher.publish(pkg, { draftId: id });
  logger.info(
    { draftId: id, location: result.location },
    "Preview do rascunho gerado",
  );
  return result;
}

export interface RejectOptions {
  embedder?: EmbeddingProvider;
  /** Motivo fixo (UI-10). */
  reason?: RejectionReason;
  /** Detalhe livre (≤ 500). */
  note?: string;
  /** "Ensinar o assistente" — `false` não grava lição. Default: true. */
  learn?: boolean;
  /** Categorias configuradas (DEC-028) — categoria da lição. */
  categories?: CategoriesConfig;
}

/** Regra de aprendizado do descarte (pura, exportada para teste). */
export function shouldLearnFromRejection(
  opts: Pick<RejectOptions, "learn" | "reason">,
): boolean {
  if (opts.learn === false) return false;
  return !(opts.reason && REASONS_WITHOUT_LESSON.includes(opts.reason));
}

/**
 * Rejeita um rascunho (PENDING ou APPROVED) → REJECTED, gravando motivo, nota
 * e data (UI-10/UI-12). A lição na Memória usa o motivo e só é gravada quando
 * `learn !== false` e o motivo não é de layout (`design` — problema de
 * template, não de conteúdo).
 */
export async function rejectDraft(
  id: string,
  opts: RejectOptions = {},
): Promise<void> {
  const detail = await loadOrThrow(id);
  const status = nextStatus(detail.draft.status, "reject");
  const rejection = { reason: opts.reason ?? null, note: opts.note ?? null };
  await updateDraftStatus(
    id,
    status,
    decisionFields(status, new Date(), rejection),
  );
  if (shouldLearnFromRejection(opts)) {
    // 2º plano: embedding não segura a fila (fail-safe).
    void recordFeedbackMemory(
      "rejected",
      opts.embedder,
      detail,
      id,
      rejection,
      opts.categories,
    );
  }
  logger.info({ draftId: id, reason: opts.reason }, "Rascunho rejeitado");
}

/**
 * Restaura descartados → PENDING (UI-11: "Desfazer" e "Devolver à revisão").
 * Valida TODOS antes de mudar qualquer um (404/409 se algum não estiver
 * REJECTED); limpa motivo/nota/data e desativa a lição daquele rascunho.
 */
export async function restoreDrafts(ids: string[]): Promise<number> {
  const rows = await getDraftStatuses(ids);
  for (const id of ids) {
    const row = rows.find((r) => r.id === id);
    if (!row) {
      throw new AppError(
        `Rascunho ${id} não encontrado.`,
        404,
        "DRAFT_NOT_FOUND",
      );
    }
    nextStatus(row.status, "restore"); // valida transição (409)
  }
  const now = new Date();
  for (const id of ids) {
    await updateDraftStatus(id, "PENDING", decisionFields("PENDING", now));
  }
  try {
    await deactivateRejectedLessons(ids);
  } catch (err) {
    logger.warn({ err, ids }, "Falha ao desativar lição (best-effort)");
  }
  logger.info({ count: ids.length }, "Rascunhos restaurados para revisão");
  return ids.length;
}

/** Restaura UM descartado (ação `restore` da Revisão). */
export async function restoreDraft(id: string): Promise<void> {
  await restoreDrafts([id]);
}

export interface DeleteDeps {
  /** Pasta-raiz de saída do agendador (onde vive `<id>/`). */
  outputDir?: string;
}

/**
 * Exclui de vez rascunhos descartados (UI-13; reutilizada pelo expurgo UI-30).
 * Só REJECTED (transação — 409 e nada apagado se algum não for). A lição na
 * Memória sobrevive (SetNull); `NewsItem`/`ProcessedUrl` ficam (a notícia não
 * volta). Remove a pasta exportada/preview `<outputDir>/<id>/` se existir.
 */
export async function deleteRejectedDrafts(
  ids: string[],
  deps: DeleteDeps = {},
): Promise<number> {
  const count = await deleteRejectedDraftRecords(ids);
  if (deps.outputDir) {
    for (const id of ids) {
      if (!SAFE_DRAFT_ID_RE.test(id)) continue; // só ids seguros no disco
      try {
        await rm(join(deps.outputDir, id), { recursive: true, force: true });
      } catch (err) {
        logger.warn({ err, id }, "Falha ao remover pasta (best-effort)");
      }
    }
  }
  logger.info({ count }, "Rascunhos descartados excluídos de vez");
  return count;
}

/** Marca um rascunho APPROVED como PUBLISHED (humano confirmou que postou). */
export async function markDraftPublished(id: string): Promise<void> {
  const detail = await loadOrThrow(id);
  const status = nextStatus(detail.draft.status, "publish");
  await updateDraftStatus(id, status, decisionFields(status, new Date()));
  logger.info({ draftId: id }, "Rascunho marcado como publicado");
}

/**
 * Expurgo automático (UI-30): exclui de vez os descartados com mais de
 * `retentionDays` dias, pela mesma rotina de "Excluir de vez" (lição na
 * Memória sobrevive; notícia não volta). Chamado ao fim de cada rodada.
 */
export async function purgeExpiredRejected(
  now: Date,
  retentionDays: number,
  deps: DeleteDeps = {},
): Promise<number> {
  const ids = await listRejectedDecidedBefore(
    retentionCutoff(now, retentionDays),
  );
  if (ids.length === 0) return 0;
  const n = await deleteRejectedDrafts(ids, deps);
  logger.info({ count: n, retentionDays }, "Expurgo de descartados vencidos");
  return n;
}
