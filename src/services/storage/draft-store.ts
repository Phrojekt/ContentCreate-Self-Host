import type { Draft as DbDraft } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { parseSlideContentArray } from "@/lib/slide-content";
import type { LlmOutput } from "@/services/llm/llm-provider";
import type { DecisionFields } from "@/services/publishing/status";
import type { Draft, DraftStatus, SlideContent } from "@/types/draft";

export interface SaveDraftInput {
  newsItemId: string;
  output: LlmOutput;
  /** Rodada que gerou o rascunho (UI-20). */
  pipelineRunId?: string;
}

/** Faz parse de uma coluna JSON de array de strings, tolerando vazio/ausente. */
function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Faz parse da coluna JSON de slides em `SlideContent[]` — via
 * `parseSlideContentArray` (fonte única de verdade, `src/lib/slide-content.ts`).
 * Preserva `slideType`/`eyebrow`/`stat`/`comparison`/`quote` além de `lead`/
 * `body`; um parser duplicado aqui já esqueceu esses campos uma vez e fez todo
 * rascunho relido do banco colapsar para o arquétipo genérico "contexto" —
 * não repita esse parser.
 */
function parseSlides(value: string | null | undefined): SlideContent[] {
  if (!value) return [];
  try {
    return parseSlideContentArray(JSON.parse(value) as unknown);
  } catch {
    return [];
  }
}

/** Mapeia o registro do banco para o tipo de domínio `Draft`. */
function toDraft(record: DbDraft): Draft {
  return {
    id: record.id,
    status: record.status as DraftStatus,
    shortTitle: record.shortTitle,
    caption: record.caption,
    hashtags: parseStringArray(record.hashtags),
    slides: parseSlides(record.slides),
    newsItemId: record.newsItemId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    rejectionReason: record.rejectionReason,
    rejectionNote: record.rejectionNote,
    approvedAt: record.approvedAt,
    rejectedAt: record.rejectedAt,
    publishedAt: record.publishedAt,
    editedAt: record.editedAt,
  };
}

/** Persiste um rascunho gerado pelo LLM. Status inicial: PENDING. */
export async function saveDraft(input: SaveDraftInput): Promise<void> {
  await prisma.draft.create({
    data: {
      newsItemId: input.newsItemId,
      shortTitle: input.output.shortTitle,
      caption: input.output.caption,
      hashtags: JSON.stringify(input.output.hashtags),
      slides: JSON.stringify(input.output.slides ?? []),
      ...(input.pipelineRunId ? { pipelineRunId: input.pipelineRunId } : {}),
      ...(input.output.quality
        ? {
            qualityScore: Math.round(input.output.quality.total),
            qualityReport: JSON.stringify({
              breakdown: input.output.quality.breakdown,
              violations: input.output.quality.violations,
              attempts: input.output.quality.attempts,
            }),
          }
        : {}),
    },
  });
}

/** Lista todos os rascunhos pendentes de revisão, do mais recente ao mais antigo. */
export async function listPendingDrafts(): Promise<Draft[]> {
  const records = await prisma.draft.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  return records.map(toDraft);
}

/** Item da fila de revisão (inclui dados da notícia para exibir na tela). */
export interface ReviewDraft {
  id: string;
  status: DraftStatus;
  shortTitle: string;
  caption: string;
  hashtags: string[];
  source: string;
  /** Link da matéria original (crédito/conferência — DEC-008). */
  url: string;
  createdAt: Date;
  updatedAt: Date;
  rejectionReason: string | null;
  rejectionNote: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  publishedAt: Date | null;
  qualityScore: number | null;
  qualityReport: QualityReport | null;
}

/** Diagnóstico salvo do verificador (UI-21). */
export interface QualityReport {
  breakdown: Record<string, number>;
  violations: string[];
  attempts: number;
}

/** Parse tolerante do JSON de `Draft.qualityReport`. */
export function parseQualityReport(
  value: string | null | undefined,
): QualityReport | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value) as Partial<QualityReport>;
    return {
      breakdown:
        v.breakdown && typeof v.breakdown === "object" ? v.breakdown : {},
      violations: Array.isArray(v.violations)
        ? v.violations.filter((x): x is string => typeof x === "string")
        : [],
      attempts: typeof v.attempts === "number" ? v.attempts : 1,
    };
  } catch {
    return null;
  }
}

export interface ReviewQueueFilter {
  /** Status a listar (default: PENDING + APPROVED). */
  statuses?: DraftStatus[];
}

/** Fila de revisão: rascunhos por status, do mais recente ao mais antigo. */
export async function listReviewQueue(
  filter: ReviewQueueFilter = {},
): Promise<ReviewDraft[]> {
  const statuses = filter.statuses ?? ["PENDING", "APPROVED"];
  const records = await prisma.draft.findMany({
    where: { status: { in: statuses } },
    include: { newsItem: true },
    orderBy: { createdAt: "desc" },
  });
  return records.map((r) => ({
    id: r.id,
    status: r.status as DraftStatus,
    shortTitle: r.shortTitle,
    caption: r.caption,
    hashtags: parseStringArray(r.hashtags),
    source: r.newsItem.source,
    url: r.newsItem.url,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    rejectionReason: r.rejectionReason,
    rejectionNote: r.rejectionNote,
    approvedAt: r.approvedAt,
    rejectedAt: r.rejectedAt,
    publishedAt: r.publishedAt,
    qualityScore: r.qualityScore,
    qualityReport: parseQualityReport(r.qualityReport),
  }));
}

/** Contagem de rascunhos por status (badges da navegação). */
export async function countDraftsByStatus(): Promise<
  Record<DraftStatus, number>
> {
  const groups = await prisma.draft.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts: Record<DraftStatus, number> = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    PUBLISHED: 0,
  };
  for (const g of groups) counts[g.status as DraftStatus] = g._count._all;
  return counts;
}

/** Detalhe do rascunho + dados da notícia necessários para renderizar/publicar. */
export interface DraftDetail {
  draft: Draft;
  source: string;
  imageUrl: string | null;
  publishedAt: Date;
  /** Resumo da notícia (referência de fatos para o ajuste de slide — UI-34). */
  summary?: string;
}

export async function getDraftDetail(id: string): Promise<DraftDetail | null> {
  const record = await prisma.draft.findUnique({
    where: { id },
    include: { newsItem: true },
  });
  if (!record) return null;
  return {
    draft: toDraft(record),
    source: record.newsItem.source,
    imageUrl: record.newsItem.imageUrl,
    publishedAt: record.newsItem.publishedAt,
    summary: record.newsItem.summary,
  };
}

/** Atualiza o status do rascunho (ciclo de vida — DEC-011) + campos de decisão. */
export async function updateDraftStatus(
  id: string,
  status: DraftStatus,
  fields: DecisionFields = {},
): Promise<void> {
  await prisma.draft.update({ where: { id }, data: { status, ...fields } });
}

/** Status atual de vários rascunhos (ações em lote). */
export async function getDraftStatuses(
  ids: string[],
): Promise<{ id: string; status: DraftStatus }[]> {
  const rows = await prisma.draft.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true },
  });
  return rows.map((r) => ({ id: r.id, status: r.status as DraftStatus }));
}

/**
 * Exclui de vez rascunhos — SÓ se TODOS estiverem REJECTED (DEC-025 item 1).
 * Numa transação: qualquer id inexistente ou com outro status → 409 e nada é
 * apagado. `MemoryEntry.draftId` vira null (FK SetNull — a lição sobrevive).
 * NÃO apaga `NewsItem` nem `ProcessedUrl` (a notícia não volta na rodada).
 */
export async function deleteRejectedDraftRecords(
  ids: string[],
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.draft.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
    const invalid = ids.filter(
      (id) => rows.find((r) => r.id === id)?.status !== "REJECTED",
    );
    if (invalid.length > 0) {
      throw new AppError(
        `Só rascunhos descartados podem ser excluídos (${invalid.length} inválido(s)).`,
        409,
        "DELETE_ONLY_REJECTED",
      );
    }
    const res = await tx.draft.deleteMany({
      where: { id: { in: ids }, status: "REJECTED" },
    });
    return res.count;
  });
}

/** Decisões humanas desde `since` (cartão "Sua semana" — UI-22, via UI-12). */
export async function countDecisionsSince(
  since: Date,
): Promise<{ approved: number; rejected: number }> {
  const [approved, rejected] = await Promise.all([
    prisma.draft.count({ where: { approvedAt: { gte: since } } }),
    prisma.draft.count({ where: { rejectedAt: { gte: since } } }),
  ]);
  return { approved, rejected };
}

/**
 * Ids de descartados cuja decisão (`rejectedAt`, ou `updatedAt` em rascunhos
 * antigos) é anterior ao corte — candidatos ao expurgo (UI-30).
 */
export async function listRejectedDecidedBefore(
  cutoff: Date,
): Promise<string[]> {
  const rows = await prisma.draft.findMany({
    where: {
      status: "REJECTED",
      OR: [
        { rejectedAt: { lt: cutoff } },
        { rejectedAt: null, updatedAt: { lt: cutoff } },
      ],
    },
    select: { id: true },
    take: 500,
  });
  return rows.map((r) => r.id);
}

/** Campos de conteúdo editáveis por humano (UI-32). */
export interface DraftContentPatch {
  shortTitle?: string;
  caption?: string;
  hashtags?: string[];
  slides?: SlideContent[];
}

/**
 * Grava a edição humana do conteúdo e marca `editedAt` — só se o rascunho
 * ainda estiver PENDING (evita editar algo aprovado em paralelo). Devolve
 * `false` se nada foi alterado (status mudou).
 */
export async function updateDraftContent(
  id: string,
  patch: DraftContentPatch,
  editedAt: Date,
): Promise<boolean> {
  const res = await prisma.draft.updateMany({
    where: { id, status: "PENDING" },
    data: {
      ...(patch.shortTitle !== undefined
        ? { shortTitle: patch.shortTitle }
        : {}),
      ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
      ...(patch.hashtags !== undefined
        ? { hashtags: JSON.stringify(patch.hashtags) }
        : {}),
      ...(patch.slides !== undefined
        ? { slides: JSON.stringify(patch.slides) }
        : {}),
      editedAt,
    },
  });
  return res.count > 0;
}
