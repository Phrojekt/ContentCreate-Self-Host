import type { PipelineRun as DbRun } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { PipelineResult } from "@/services/pipeline/pipeline";
import type { SourceStat } from "@/services/pipeline/source-stats";

export type RunTrigger = "SCHEDULED" | "MANUAL";
export type RunStatus = "RUNNING" | "OK" | "PARTIAL" | "FAILED" | "SKIPPED";

/** Rodada persistida (UI-20) — o funil que antes só ia para log/Telegram. */
export interface PipelineRunRecord {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  trigger: RunTrigger;
  status: RunStatus;
  collected: number;
  afterDedup: number;
  afterFilter: number;
  afterAlreadyProcessed: number;
  afterSemantic: number;
  selected: number;
  skippedThinContent: number;
  draftsCreated: number;
  estimatedCostUsd: number;
  errors: string[];
  failure: string | null;
  /** Saúde por fonte (UI-31); vazio em rodadas anteriores a ela. */
  sourceStats: SourceStat[];
}

export interface FinishRunInput {
  status: Exclude<RunStatus, "RUNNING">;
  finishedAt: Date;
  durationMs: number;
  result?: PipelineResult;
  failure?: string;
}

function parseErrors(json: string): string[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function parseSourceStats(json: string | null): SourceStat[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v)
      ? v.filter(
          (x): x is SourceStat =>
            !!x &&
            typeof x === "object" &&
            typeof (x as SourceStat).source === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function toRecord(r: DbRun): PipelineRunRecord {
  return {
    ...r,
    trigger: r.trigger as RunTrigger,
    status: r.status as RunStatus,
    errors: parseErrors(r.errors),
    sourceStats: parseSourceStats(r.sourceStats),
  };
}

/** Abre o registro da rodada (status RUNNING). */
export async function startRun(
  trigger: RunTrigger,
  startedAt: Date,
): Promise<string> {
  const run = await prisma.pipelineRun.create({
    data: { trigger, startedAt },
    select: { id: true },
  });
  return run.id;
}

/** Fecha o registro com o status final e o funil por etapa. */
export async function finishRun(
  id: string,
  input: FinishRunInput,
): Promise<void> {
  const r = input.result;
  await prisma.pipelineRun.update({
    where: { id },
    data: {
      status: input.status,
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
      failure: input.failure ?? null,
      ...(r
        ? {
            collected: r.collected,
            afterDedup: r.afterDedup,
            afterFilter: r.afterFilter,
            afterAlreadyProcessed: r.afterAlreadyProcessed,
            afterSemantic: r.afterSemantic,
            selected: r.selected,
            skippedThinContent: r.skippedThinContent,
            draftsCreated: r.draftsCreated,
            estimatedCostUsd: r.estimatedCostUsd,
            errors: JSON.stringify(r.errors),
            ...(r.sourceStats
              ? { sourceStats: JSON.stringify(r.sourceStats) }
              : {}),
          }
        : {}),
    },
  });
}

export async function listRecentRuns(limit = 20): Promise<PipelineRunRecord[]> {
  const rows = await prisma.pipelineRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return rows.map(toRecord);
}

/** Última rodada que de fato rodou (ignora SKIPPED). */
export async function getLastRun(): Promise<PipelineRunRecord | null> {
  const row = await prisma.pipelineRun.findFirst({
    where: { status: { not: "SKIPPED" } },
    orderBy: { startedAt: "desc" },
  });
  return row ? toRecord(row) : null;
}
