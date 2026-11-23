import { schedule as cronSchedule, validate as cronValidate } from "node-cron";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type ScheduleFn = (expr: string, task: () => void) => void;

export interface SchedulerDeps {
  cronExpr: string;
  /** O que rodar a cada disparo (ex.: `runPipelineOnce`). */
  task: () => Promise<unknown>;
  /** Injetáveis para teste (default: node-cron). */
  validate?: (expr: string) => boolean;
  scheduleFn?: ScheduleFn;
}

/**
 * Registra a esteira num cron (Bloco 5). Valida a expressão antes (falha cedo).
 * O disparo é blindado: um erro numa rodada é logado e NÃO derruba o agendador.
 */
export function startScheduler(deps: SchedulerDeps): void {
  const validate = deps.validate ?? cronValidate;
  if (!validate(deps.cronExpr)) {
    throw new AppError(
      `Expressão cron inválida: "${deps.cronExpr}".`,
      400,
      "INVALID_CRON",
    );
  }

  const scheduleFn: ScheduleFn =
    deps.scheduleFn ?? ((expr, task) => void cronSchedule(expr, task));

  scheduleFn(deps.cronExpr, () => {
    void (async () => {
      try {
        await deps.task();
      } catch (err) {
        logger.error({ err }, "Erro na execução agendada da esteira");
      }
    })();
  });

  logger.info({ cron: deps.cronExpr }, "Agendador da esteira iniciado");
}
