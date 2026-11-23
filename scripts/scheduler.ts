// Inicia o agendador da esteira (Bloco 5). Processo de longa duração — mantém-se
// vivo pelo timer do cron. Encerrar com Ctrl+C.
//
//   npm run scheduler:start
//
// A expressão cron vem de PIPELINE_CRON (env) ou do default em
// src/constants/orchestration.ts. Configure TELEGRAM_* no .env para receber
// notificações; sem isso, a esteira apenas loga.

import "dotenv/config";

async function main() {
  const { env } = await import("../src/lib/env.js");
  const { startScheduler, runPipelineOnce } =
    await import("../src/services/orchestration/index.js");
  const { DEFAULT_CRON } = await import("../src/constants/orchestration.js");

  const cronExpr = env.PIPELINE_CRON ?? DEFAULT_CRON;
  startScheduler({ cronExpr, task: () => runPipelineOnce("SCHEDULED") });

  console.log(
    `Agendador da esteira ativo (cron: "${cronExpr}"). Ctrl+C para encerrar.`,
  );
}

main().catch((err: unknown) => {
  console.error(
    "Falha ao iniciar o agendador:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
