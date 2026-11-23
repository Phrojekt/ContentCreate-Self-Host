import { randomUUID } from "node:crypto";

import { episodicSeed } from "@config/episodic-seed";
import { proceduralMemory } from "@config/procedural-memory";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { EmbeddingProvider } from "@/services/embedding";
import { selectVariant } from "@/services/rendering/theme-selector";
import { rejectionLabel, type RejectionReason } from "@/constants/rejection";
import type { DraftDetail } from "@/services/storage/draft-store";

/** Entrada de memória já pronta para injeção no prompt (`NewsItem.learnedGuidance`). */
export interface RecalledMemory {
  id: string;
  content: string;
  category: string | null;
}

/**
 * `embedding` é `vector(768)` nativo do pgvector (DEC-021) — o driver Postgres
 * do Prisma não tem um tipo JS para `vector`, então lê/escreve sempre via SQL
 * puro (`$queryRaw`/`$executeRaw`), passando um literal de texto `[0.1,0.2,...]`
 * com cast `::vector` (forma documentada pelo pgvector para drivers sem
 * suporte nativo ao tipo).
 */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/**
 * Recupera as `topK` entradas de memória mais relevantes para `queryText`
 * (DEC-020), usando a busca por similaridade nativa do pgvector (`<=>` —
 * distância de cosseno, DEC-021). Filtra por `kind` e, quando informada, por
 * `category` OU entradas genéricas (`category: null`) — uma regra de "data"
 * nunca aparece pra "business", mas uma regra sem categoria vale pra qualquer
 * post.
 *
 * Fail-safe: qualquer erro (embedder indisponível, etc.) devolve `[]` e loga
 * — a ausência de memória nunca derruba a geração (mesma filosofia da dedup
 * semântica em `pipeline.ts`).
 */
export async function recallMemory(
  embedder: EmbeddingProvider,
  queryText: string,
  opts: { kind: "PROCEDURAL" | "EPISODIC"; category?: string; topK: number },
): Promise<RecalledMemory[]> {
  try {
    // Poupa a chamada de embedding quando não há nenhum candidato do kind/
    // categoria pedidos (colunas typed — sem tocar em `embedding`).
    const candidateCount = await prisma.memoryEntry.count({
      where: {
        kind: opts.kind,
        active: true,
        ...(opts.category
          ? { OR: [{ category: opts.category }, { category: null }] }
          : {}),
      },
    });
    if (candidateCount === 0) return [];

    const [queryVector] = await embedder.embed([queryText]);
    if (!queryVector) return [];

    const categoryFilter = opts.category
      ? Prisma.sql`AND ("category" = ${opts.category} OR "category" IS NULL)`
      : Prisma.empty;

    return await prisma.$queryRaw<RecalledMemory[]>`
      SELECT "id", "content", "category"
      FROM "MemoryEntry"
      WHERE "kind" = ${opts.kind}::"MemoryKind" AND "active" = true ${categoryFilter}
      ORDER BY "embedding" <=> ${toVectorLiteral(queryVector)}::vector
      LIMIT ${opts.topK}
    `;
  } catch (err) {
    logger.warn(
      { err },
      "Recall de memória falhou — seguindo sem contexto (fail-safe)",
    );
    return [];
  }
}

/**
 * Sincroniza `config/procedural-memory.ts` no banco (idempotente — upsert por
 * `id` estável). Chamado uma vez por rodada da esteira (custo desprezível:
 * poucas entradas, só recalcula o embedding se o conteúdo mudou).
 */
export async function syncManualMemory(
  embedder: EmbeddingProvider,
): Promise<void> {
  for (const seed of proceduralMemory) {
    const id = `manual:${seed.id}`;
    const existing = await prisma.memoryEntry.findUnique({
      where: { id },
      select: { content: true },
    });
    if (existing && existing.content === seed.content) continue; // sem mudança — poupa embed

    const [vector] = await embedder.embed([seed.content]);
    if (!vector) continue;
    const category = seed.category ?? null;

    await prisma.$executeRaw`
      INSERT INTO "MemoryEntry" ("id", "kind", "source", "content", "embedding", "category", "active", "createdAt", "updatedAt")
      VALUES (${id}, 'PROCEDURAL', 'MANUAL', ${seed.content}, ${toVectorLiteral(vector)}::vector, ${category}, true, now(), now())
      ON CONFLICT ("id") DO UPDATE SET
        "content" = EXCLUDED."content",
        "embedding" = EXCLUDED."embedding",
        "category" = EXCLUDED."category",
        "updatedAt" = now()
    `;
  }
}

/**
 * Sincroniza `config/episodic-seed.ts` no banco (idempotente — upsert por
 * `id` estável, mesmo padrão de `syncManualMemory`). Kind EPISODIC, source
 * MANUAL — distingue da memória episódica aprendida por feedback humano
 * (FEEDBACK_APPROVED, `recordApprovedExample`). Dá aos exemplos-ouro da
 * biblioteca (DEC-024) o mesmo canal de recall por similaridade desde a
 * primeira rodada, antes de existir qualquer rascunho aprovado.
 */
export async function syncManualEpisodic(
  embedder: EmbeddingProvider,
): Promise<void> {
  for (const seed of episodicSeed) {
    const id = `manual-episodic:${seed.id}`;
    const content = `[SITUAÇÃO: ${seed.situation}]\n${seed.example}`;
    const existing = await prisma.memoryEntry.findUnique({
      where: { id },
      select: { content: true },
    });
    if (existing && existing.content === content) continue; // sem mudança — poupa embed

    const [vector] = await embedder.embed([content]);
    if (!vector) continue;
    const category = seed.category ?? null;

    await prisma.$executeRaw`
      INSERT INTO "MemoryEntry" ("id", "kind", "source", "content", "embedding", "category", "active", "createdAt", "updatedAt")
      VALUES (${id}, 'EPISODIC', 'MANUAL', ${content}, ${toVectorLiteral(vector)}::vector, ${category}, true, now(), now())
      ON CONFLICT ("id") DO UPDATE SET
        "content" = EXCLUDED."content",
        "embedding" = EXCLUDED."embedding",
        "category" = EXCLUDED."category",
        "updatedAt" = now()
    `;
  }
}

/** Texto compacto do rascunho, usado como conteúdo do exemplo/lição de memória. */
function summarizeDraftForMemory(detail: DraftDetail): string {
  const slidesText = detail.draft.slides
    .map(
      (s, i) =>
        `slide ${i + 1} [${s.slideType ?? "context"}]: ${s.eyebrow ?? ""} — lead="${s.lead}" body="${s.body}"`,
    )
    .join("\n");
  return `shortTitle: "${detail.draft.shortTitle}"\n${slidesText}\ncaption: "${detail.draft.caption}"`.slice(
    0,
    2000,
  );
}

/**
 * Grava um exemplo `EPISODIC` a partir de um rascunho APROVADO (DEC-020) —
 * few-shot do que funcionou, recuperável em gerações futuras da mesma
 * categoria. Best-effort: chamador nunca deve deixar isso bloquear a aprovação.
 *
 * Roda em segundo plano (depois da resposta à UI): o INSERT só acontece se o
 * rascunho ainda estiver APPROVED/PUBLISHED quando o embedding terminar.
 */
export async function recordApprovedExample(
  embedder: EmbeddingProvider,
  detail: DraftDetail,
  draftId: string,
  /** Categoria já classificada com as categorias configuradas (DEC-028). */
  categoryOverride?: string,
): Promise<void> {
  const category =
    categoryOverride ??
    selectVariant(detail.draft.shortTitle, detail.draft.caption);
  const content = `[EXEMPLO APROVADO — categoria: ${category}]\n${summarizeDraftForMemory(detail)}`;
  const [vector] = await embedder.embed([content]);
  if (!vector) return;

  await prisma.$executeRaw`
    INSERT INTO "MemoryEntry" ("id", "kind", "source", "content", "embedding", "category", "draftId", "active", "createdAt", "updatedAt")
    SELECT ${randomUUID()}, 'EPISODIC', 'FEEDBACK_APPROVED', ${content}, ${toVectorLiteral(vector)}::vector, ${category}, ${draftId}, true, now(), now()
    WHERE EXISTS (SELECT 1 FROM "Draft" WHERE "id" = ${draftId} AND "status" IN ('APPROVED', 'PUBLISHED'))
  `;
}

/** Motivo estruturado do descarte (UI-10). */
export interface RejectionInput {
  /** Código de `REJECTION_REASONS`. */
  reason?: RejectionReason | null;
  note?: string | null;
}

/**
 * Texto da lição de descarte. Com motivo/nota (UI-10), a lição diz POR QUE o
 * humano descartou; sem eles (rascunhos antigos/API sem motivo), cai na lição
 * genérica da v1. Função pura (exportada para teste).
 */
export function buildRejectedLessonContent(
  detail: DraftDetail,
  category: string,
  rejection: RejectionInput = {},
): string {
  const label = rejectionLabel(rejection.reason);
  const note = rejection.note?.trim();
  const why = [
    label ? `Motivo do descarte: ${label}.` : null,
    note ? `Detalhe do revisor: ${note}` : null,
  ].filter(Boolean);
  const guidance =
    why.length > 0
      ? `${why.join("\n")}\nEvite repetir esse problema em notícias semelhantes.`
      : "Evite repetir este padrão de tom/estrutura para notícias semelhantes.";
  return `[LIÇÃO — rascunho rejeitado, categoria: ${category}]\n${summarizeDraftForMemory(detail)}\n${guidance}`;
}

/**
 * Grava uma lição `PROCEDURAL` a partir de um rascunho REJEITADO (DEC-020),
 * com o motivo/nota escolhidos na UI (UI-10). Best-effort, mesma filosofia
 * acima. O INSERT só acontece se o rascunho ainda estiver REJECTED quando o
 * embedding terminar — um "Desfazer" imediato (UI-11) não deixa lição órfã.
 */
export async function recordRejectedLesson(
  embedder: EmbeddingProvider,
  detail: DraftDetail,
  draftId: string,
  rejection: RejectionInput = {},
  /** Categoria já classificada com as categorias configuradas (DEC-028). */
  categoryOverride?: string,
): Promise<void> {
  const category =
    categoryOverride ??
    selectVariant(detail.draft.shortTitle, detail.draft.caption);
  const content = buildRejectedLessonContent(detail, category, rejection);
  const [vector] = await embedder.embed([content]);
  if (!vector) return;

  await prisma.$executeRaw`
    INSERT INTO "MemoryEntry" ("id", "kind", "source", "content", "embedding", "category", "draftId", "active", "createdAt", "updatedAt")
    SELECT ${randomUUID()}, 'PROCEDURAL', 'FEEDBACK_REJECTED', ${content}, ${toVectorLiteral(vector)}::vector, ${category}, ${draftId}, true, now(), now()
    WHERE EXISTS (SELECT 1 FROM "Draft" WHERE "id" = ${draftId} AND "status" = 'REJECTED')
  `;
}

/**
 * Desativa (nunca apaga — DEC-020) as lições de descarte de um rascunho.
 * Usada ao restaurar um descartado (UI-11): a lição não vale mais.
 */
export async function deactivateRejectedLessons(
  draftIds: string[],
): Promise<number> {
  if (draftIds.length === 0) return 0;
  return prisma.$executeRaw`
    UPDATE "MemoryEntry" SET "active" = false, "updatedAt" = now()
    WHERE "draftId" IN (${Prisma.join(draftIds)}) AND "source" = 'FEEDBACK_REJECTED' AND "active" = true
  `;
}

/** Entrada de memória para a UI (sem a coluna `embedding`). */
export interface MemoryListItem {
  id: string;
  kind: "PROCEDURAL" | "EPISODIC";
  source: "MANUAL" | "FEEDBACK_APPROVED" | "FEEDBACK_REJECTED";
  content: string;
  category: string | null;
  active: boolean;
  draftId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryListFilter {
  source?: MemoryListItem["source"];
  /** Só feedback (aprovações + descartes). */
  feedbackOnly?: boolean;
  active?: boolean;
  since?: Date;
  limit?: number;
}

/**
 * Lista entradas de memória (UI-22/UI-24) por SQL puro, SEM a coluna
 * `embedding` (vector — pesada e inútil para a tela). Mais recentes primeiro.
 */
export async function listMemoryEntries(
  filter: MemoryListFilter = {},
): Promise<MemoryListItem[]> {
  const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (filter.source) conds.push(Prisma.sql`"source"::text = ${filter.source}`);
  if (filter.feedbackOnly)
    conds.push(
      Prisma.sql`"source"::text IN ('FEEDBACK_APPROVED', 'FEEDBACK_REJECTED')`,
    );
  if (filter.active !== undefined)
    conds.push(Prisma.sql`"active" = ${filter.active}`);
  if (filter.since) conds.push(Prisma.sql`"createdAt" >= ${filter.since}`);
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
  return prisma.$queryRaw<MemoryListItem[]>`
    SELECT "id", "kind"::text AS "kind", "source"::text AS "source", "content", "category", "active", "draftId", "createdAt", "updatedAt"
    FROM "MemoryEntry"
    WHERE ${Prisma.join(conds, " AND ")}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;
}

/**
 * Liga/desliga uma entrada de memória (UI-24). Nunca DELETE (DEC-020). O sync
 * da memória manual NÃO reativa o que a UI desligou (DEC-025 item 4): o
 * `ON CONFLICT ... DO UPDATE` de `syncManual*` não toca em `active`.
 * Devolve `false` se o id não existe.
 */
export async function setMemoryEntryActive(
  id: string,
  active: boolean,
): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE "MemoryEntry" SET "active" = ${active}, "updatedAt" = now() WHERE "id" = ${id}
  `;
  return n > 0;
}
