import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  runOrchestratedPipeline,
  runStatusOf,
  type RunLog,
} from "@/services/orchestration/orchestrator";
import type { PipelineResult } from "@/services/pipeline/pipeline";
import type { Notifier } from "@/types";

function result(over: Partial<PipelineResult> = {}): PipelineResult {
  return {
    collected: 10,
    afterDedup: 8,
    afterFilter: 6,
    afterAlreadyProcessed: 4,
    afterSemantic: 4,
    selected: 3,
    skippedThinContent: 0,
    draftsCreated: 3,
    estimatedCostUsd: 0.01,
    errors: [],
    ...over,
  };
}

const notifier = (): Notifier => ({
  id: "n",
  notify: vi.fn().mockResolvedValue(undefined),
});

function fakeLog(): RunLog & {
  start: ReturnType<typeof vi.fn>;
  finish: ReturnType<typeof vi.fn>;
} {
  return {
    start: vi.fn().mockResolvedValue("run-1"),
    finish: vi.fn().mockResolvedValue(undefined),
  };
}

describe("UI-20 — registro da rodada (PipelineRun)", () => {
  it("OK: grava início com o trigger, repassa o runId e fecha com o funil", async () => {
    const runLog = fakeLog();
    const run = vi.fn().mockResolvedValue(result());
    await runOrchestratedPipeline({
      run,
      runLog,
      trigger: "SCHEDULED",
      notifier: notifier(),
    });
    expect(runLog.start).toHaveBeenCalledWith("SCHEDULED", expect.any(Date));
    expect(run).toHaveBeenCalledWith({ runId: "run-1" });
    expect(runLog.finish).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "OK", result: result() }),
    );
  });

  it("PARTIAL: erros mas com rascunho criado", async () => {
    const runLog = fakeLog();
    await runOrchestratedPipeline({
      run: async () => result({ errors: ["LLM: timeout"], draftsCreated: 2 }),
      runLog,
      notifier: notifier(),
    });
    expect(runLog.finish.mock.calls[0]![1].status).toBe("PARTIAL");
  });

  it("FAILED: exceção na rodada guarda a mensagem", async () => {
    const runLog = fakeLog();
    await runOrchestratedPipeline({
      run: async () => {
        throw new Error("coleta caiu");
      },
      runLog,
      notifier: notifier(),
    });
    expect(runLog.finish).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "FAILED", failure: "coleta caiu" }),
    );
  });

  it("SKIPPED: lock não adquirido também é registrado e o pipeline não roda", async () => {
    const runLog = fakeLog();
    const run = vi.fn();
    await runOrchestratedPipeline({
      run,
      runLog,
      notifier: notifier(),
      lock: { acquire: async () => false, release: vi.fn() },
    });
    expect(run).not.toHaveBeenCalled();
    expect(runLog.finish.mock.calls[0]![1].status).toBe("SKIPPED");
  });

  it("falha ao gravar a rodada não derruba nem muda o resultado (fail-safe)", async () => {
    const runLog: RunLog = {
      start: vi.fn().mockRejectedValue(new Error("db fora")),
      finish: vi.fn(),
    };
    const run = vi.fn().mockResolvedValue(result());
    const outcome = await runOrchestratedPipeline({
      run,
      runLog,
      notifier: notifier(),
    });
    expect(outcome.ok).toBe(true);
    expect(run).toHaveBeenCalledWith({});
    expect(runLog.finish).not.toHaveBeenCalled();
  });

  it("falha no finish também é engolida", async () => {
    const runLog = fakeLog();
    runLog.finish.mockRejectedValue(new Error("db fora"));
    const outcome = await runOrchestratedPipeline({
      run: async () => result(),
      runLog,
      notifier: notifier(),
    });
    expect(outcome.ok).toBe(true);
  });

  it("runStatusOf: erros sem nenhum rascunho → FAILED", () => {
    const base = {
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 1,
    };
    expect(
      runStatusOf({
        ok: true,
        result: result({ errors: ["x"], draftsCreated: 0 }),
        ...base,
      }),
    ).toBe("FAILED");
    expect(runStatusOf({ ok: true, result: result(), ...base })).toBe("OK");
    expect(runStatusOf({ ok: true, skipped: true, ...base })).toBe("SKIPPED");
  });
});
