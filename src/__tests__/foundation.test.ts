import { describe, expect, it } from "vitest";

import { projectConfig } from "@config/project.config";
import { env } from "@/lib/env";

// Smoke test da fundação P0: prova que o test runner, os aliases (@/* e @config/*)
// e a config carregam. Não testa lógica de nenhum bloco da esteira (P1+).
describe("fundação P0", () => {
  it("carrega a env validada", () => {
    expect(env.DATABASE_URL).toBeTruthy();
    expect(["development", "test", "production"]).toContain(env.NODE_ENV);
  });

  it("carrega o projectConfig (neutro)", () => {
    expect(projectConfig.theme.language).toBe("pt-BR");
    expect(projectConfig.selection.topN).toBeGreaterThan(0);
    expect(projectConfig.dedup.titleSimilarityThreshold).toBeGreaterThan(0);
  });
});
