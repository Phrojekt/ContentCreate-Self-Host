// Carrega .env antes de qualquer módulo da aplicação (deve ser o primeiro import).
import "dotenv/config";

async function main() {
  // Import dinâmico garante que dotenv já executou quando os módulos avaliam
  // suas variáveis de ambiente no nível de módulo (ex.: src/lib/env.ts com Zod).
  const { runPipelineOnce } =
    await import("../src/services/orchestration/index.js");

  console.log("Iniciando esteira...\n");
  const outcome = await runPipelineOnce();

  if (!outcome.ok) {
    console.error(`Esteira falhou: ${outcome.error}`);
    process.exit(1);
  }

  if (outcome.skipped) {
    console.log("Já há uma rodada em andamento — esta foi pulada.");
    return;
  }

  const r = outcome.result;
  console.log("Esteira concluída:");
  console.log(`  Coletados:         ${r?.collected ?? 0}`);
  console.log(`  Após dedup:        ${r?.afterDedup ?? 0}`);
  console.log(`  Após filtro:       ${r?.afterFilter ?? 0}`);
  console.log(`  Novos (não proc.): ${r?.afterAlreadyProcessed ?? 0}`);
  console.log(`  Selecionados:      ${r?.selected ?? 0}`);
  console.log(`  Descartados (magro): ${r?.skippedThinContent ?? 0}`);
  console.log(`  Rascunhos criados: ${r?.draftsCreated ?? 0}`);
  console.log(
    `  Custo estimado:    US$ ${(r?.estimatedCostUsd ?? 0).toFixed(4)}`,
  );
  console.log(
    `  Duração:           ${(outcome.durationMs / 1000).toFixed(1)}s`,
  );

  if (r && r.errors.length > 0) {
    console.warn("\nErros durante a esteira:");
    for (const err of r.errors) {
      console.warn(`  - ${err}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error("Esteira falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
