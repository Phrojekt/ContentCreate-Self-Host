import { logger } from "@/lib/logger";
import type { PipelineResult } from "@/services/pipeline/pipeline";
import type { Notifier, NotifyMessage } from "@/types";

export interface OrchestrationOutcome {
  ok: boolean;
  result?: PipelineResult;
  error?: string;
  /** `true` quando a rodada foi pulada por já haver outra em andamento (lock). */
  skipped?: boolean;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
}

/**
 * Trava de exclusão mútua para serializar rodadas (evita o TOCTOU em
 * filterAlreadyProcessed/markAsProcessed que duplicaria rascunhos). `acquire`
 * devolve `false` quando já há uma rodada ativa; só se libera o que se adquiriu.
 */
export interface PipelineLock {
  acquire: () => Promise<boolean>;
  release: () => Promise<void>;
}

/** Status final de uma rodada persistida (UI-20). */
export type RunFinalStatus = "OK" | "PARTIAL" | "FAILED" | "SKIPPED";
export type RunTriggerKind = "SCHEDULED" | "MANUAL";

/**
 * Registro da rodada (UI-20). `start` devolve o id que é repassado ao `run`
 * (rascunhos ficam ligados à rodada). Falhas aqui só logam (fail-safe).
 */
export interface RunLog {
  start: (trigger: RunTriggerKind, startedAt: Date) => Promise<string>;
  finish: (
    id: string,
    data: {
      status: RunFinalStatus;
      finishedAt: Date;
      durationMs: number;
      result?: PipelineResult;
      failure?: string;
    },
  ) => Promise<void>;
}

/**
 * Status de uma rodada a partir do resultado (função pura):
 * pulada → SKIPPED · exceção → FAILED · erros e nenhum rascunho → FAILED ·
 * erros com rascunho → PARTIAL · sem erros → OK.
 */
export function runStatusOf(outcome: OrchestrationOutcome): RunFinalStatus {
  if (outcome.skipped) return "SKIPPED";
  if (!outcome.ok || !outcome.result) return "FAILED";
  const { errors, draftsCreated } = outcome.result;
  if (errors.length === 0) return "OK";
  return draftsCreated > 0 ? "PARTIAL" : "FAILED";
}

export interface OrchestrateDeps {
  /** Execução do pipeline (injetável p/ testes); recebe o id da rodada registrada. */
  run: (ctx: { runId?: string }) => Promise<PipelineResult>;
  /** Quem disparou (UI-20). Default MANUAL. */
  trigger?: RunTriggerKind;
  /** Persistência da rodada (UI-20). Ausente → só log/notificação. */
  runLog?: RunLog;
  notifier: Notifier;
  /** Relógio injetável (testes). */
  now?: () => Date;
  /** Trava de concorrência. Ausente → sem serialização (ex.: testes simples). */
  lock?: PipelineLock;
}

/**
 * Decide se vale notificar o dono. Evita ruído: rodada bem-sucedida sem nada
 * novo (0 rascunhos, 0 erros) só é logada. Falha ou novidade sempre notifica.
 */
export function shouldNotify(outcome: OrchestrationOutcome): boolean {
  // Rodada pulada por lock: outra rodada já está cuidando — não é ruído nem falha.
  if (outcome.skipped) return false;
  if (!outcome.ok) return true;
  const r = outcome.result;
  if (!r) return true;
  return r.draftsCreated > 0 || r.errors.length > 0;
}

/** Monta a mensagem de notificação a partir do resultado (função pura). */
export function formatRunReport(outcome: OrchestrationOutcome): NotifyMessage {
  const seconds = (outcome.durationMs / 1000).toFixed(1);

  if (!outcome.ok) {
    return {
      level: "error",
      title: "❌ Esteira falhou",
      body: `Erro: ${outcome.error ?? "desconhecido"}\nDuração: ${seconds}s`,
    };
  }

  const r = outcome.result;
  const lines = [
    `Coletados: ${r?.collected ?? 0}`,
    `Após dedup: ${r?.afterDedup ?? 0}`,
    `Após filtro: ${r?.afterFilter ?? 0}`,
    `Novos (não processados): ${r?.afterAlreadyProcessed ?? 0}`,
    `Selecionados: ${r?.selected ?? 0}`,
    `Descartados (conteúdo magro): ${r?.skippedThinContent ?? 0}`,
    `Rascunhos criados: ${r?.draftsCreated ?? 0}`,
    `Custo estimado: US$ ${(r?.estimatedCostUsd ?? 0).toFixed(4)}`,
    `Duração: ${seconds}s`,
  ];
  if (r && r.errors.length > 0) {
    lines.push(`Erros: ${r.errors.length}`);
  }

  return {
    level: r && r.errors.length > 0 ? "error" : "info",
    title: "✅ Esteira concluída",
    body: lines.join("\n"),
  };
}

/**
 * Orquestra uma rodada da esteira (Bloco 5): cronometra, loga, e notifica o dono
 * em geração/falha. NÃO relança — devolve um `OrchestrationOutcome` para o
 * chamador (agendador/rota/CLI) decidir. Uma falha de notificação não mascara o
 * resultado da rodada.
 */
export async function runOrchestratedPipeline(
  deps: OrchestrateDeps,
): Promise<OrchestrationOutcome> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const trigger = deps.trigger ?? "MANUAL";
  logger.info({ trigger }, "Esteira: início da rodada");

  // Registro da rodada (UI-20) — nunca derruba a rodada.
  let runId: string | undefined;
  if (deps.runLog) {
    try {
      runId = await deps.runLog.start(trigger, startedAt);
    } catch (err) {
      logger.warn({ err }, "Esteira: falha ao registrar início da rodada");
    }
  }
  const recordFinish = async (o: OrchestrationOutcome) => {
    if (!deps.runLog || !runId) return;
    try {
      await deps.runLog.finish(runId, {
        status: runStatusOf(o),
        finishedAt: o.finishedAt,
        durationMs: o.durationMs,
        ...(o.result ? { result: o.result } : {}),
        ...(o.error ? { failure: o.error } : {}),
      });
    } catch (err) {
      logger.warn({ err, runId }, "Esteira: falha ao registrar fim da rodada");
    }
  };

  // Serialização: se outra rodada já está ativa, pula esta (evita duplicação).
  if (deps.lock && !(await deps.lock.acquire())) {
    const finishedAt = now();
    logger.warn("Esteira: já há uma rodada em andamento — pulando esta.");
    const skipped: OrchestrationOutcome = {
      ok: true,
      skipped: true,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
    await recordFinish(skipped);
    return skipped;
  }

  let outcome: OrchestrationOutcome;
  try {
    try {
      const result = await deps.run(runId ? { runId } : {});
      const finishedAt = now();
      outcome = {
        ok: true,
        result,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      };
      logger.info(
        { draftsCreated: result.draftsCreated, errors: result.errors.length },
        "Esteira: rodada concluída",
      );
    } catch (err) {
      const finishedAt = now();
      outcome = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      };
      logger.error({ err }, "Esteira: rodada falhou");
    }
  } finally {
    // Só liberamos porque chegamos aqui tendo adquirido a trava.
    if (deps.lock) {
      try {
        await deps.lock.release();
      } catch (relErr) {
        logger.error({ err: relErr }, "Esteira: falha ao liberar a trava");
      }
    }
  }

  await recordFinish(outcome);

  if (shouldNotify(outcome)) {
    try {
      await deps.notifier.notify(formatRunReport(outcome));
    } catch (notifyErr) {
      logger.error({ err: notifyErr }, "Falha ao notificar a rodada");
    }
  }

  return outcome;
}
