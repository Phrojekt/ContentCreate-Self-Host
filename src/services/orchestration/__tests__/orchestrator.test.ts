import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  formatRunReport,
  runOrchestratedPipeline,
  shouldNotify,
  type OrchestrationOutcome,
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
    estimatedCostUsd: 0,
    errors: [],
    ...over,
  };
}

function outcome(
  over: Partial<OrchestrationOutcome> = {},
): OrchestrationOutcome {
  const startedAt = new Date("2026-06-18T08:00:00Z");
  const finishedAt = new Date("2026-06-18T08:00:05Z");
  return {
    ok: true,
    result: result(),
    startedAt,
    finishedAt,
    durationMs: 5000,
    ...over,
  };
}

function fakeNotifier(): Notifier {
  return { id: "fake", notify: vi.fn().mockResolvedValue(undefined) };
}

describe("shouldNotify", () => {
  it("notifica quando há rascunhos criados", () => {
    expect(shouldNotify(outcome())).toBe(true);
  });
  it("notifica em caso de falha", () => {
    expect(shouldNotify(outcome({ ok: false, result: undefined }))).toBe(true);
  });
  it("notifica rodada com erros mesmo sem rascunhos", () => {
    expect(
      shouldNotify(
        outcome({ result: result({ draftsCreated: 0, errors: ["x"] }) }),
      ),
    ).toBe(true);
  });
  it("NÃO notifica rodada vazia bem-sucedida (evita ruído)", () => {
    expect(
      shouldNotify(
        outcome({ result: result({ draftsCreated: 0, errors: [] }) }),
      ),
    ).toBe(false);
  });
  it("NÃO notifica rodada pulada por lock", () => {
    expect(shouldNotify(outcome({ skipped: true, result: undefined }))).toBe(
      false,
    );
  });
});

describe("formatRunReport", () => {
  it("sucesso: nível info, título de concluído, conta rascunhos", () => {
    const msg = formatRunReport(outcome());
    expect(msg.level).toBe("info");
    expect(msg.title).toContain("concluída");
    expect(msg.body).toContain("Rascunhos criados: 3");
    expect(msg.body).toContain("Duração: 5.0s");
  });
  it("sucesso com erros: nível error", () => {
    const msg = formatRunReport(
      outcome({ result: result({ errors: ["falha 1"] }) }),
    );
    expect(msg.level).toBe("error");
    expect(msg.body).toContain("Erros: 1");
  });
  it("falha: nível error e mensagem do erro", () => {
    const msg = formatRunReport(
      outcome({ ok: false, result: undefined, error: "API caiu" }),
    );
    expect(msg.level).toBe("error");
    expect(msg.title).toContain("falhou");
    expect(msg.body).toContain("API caiu");
  });
});

describe("runOrchestratedPipeline", () => {
  const clock = () => {
    const times = [
      new Date("2026-06-18T08:00:00Z"),
      new Date("2026-06-18T08:00:02Z"),
    ];
    return () => times.shift() ?? new Date("2026-06-18T08:00:02Z");
  };

  it("sucesso com rascunhos: notifica e devolve outcome ok", async () => {
    const notifier = fakeNotifier();
    const out = await runOrchestratedPipeline({
      run: async () => result(),
      notifier,
      now: clock(),
    });
    expect(out.ok).toBe(true);
    expect(out.durationMs).toBe(2000);
    expect(notifier.notify).toHaveBeenCalledOnce();
  });

  it("rodada vazia: não notifica", async () => {
    const notifier = fakeNotifier();
    const out = await runOrchestratedPipeline({
      run: async () => result({ draftsCreated: 0, errors: [] }),
      notifier,
    });
    expect(out.ok).toBe(true);
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("falha do pipeline: outcome ok=false, notifica, não relança", async () => {
    const notifier = fakeNotifier();
    const out = await runOrchestratedPipeline({
      run: async () => {
        throw new Error("colapso");
      },
      notifier,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("colapso");
    expect(notifier.notify).toHaveBeenCalledOnce();
  });

  it("falha de notificação não mascara o resultado da rodada", async () => {
    const notifier: Notifier = {
      id: "boom",
      notify: vi.fn().mockRejectedValue(new Error("telegram fora")),
    };
    const out = await runOrchestratedPipeline({
      run: async () => result(),
      notifier,
    });
    expect(out.ok).toBe(true);
    expect(out.result?.draftsCreated).toBe(3);
  });

  it("lock adquirida: roda, libera a trava no fim e notifica", async () => {
    const notifier = fakeNotifier();
    const lock = {
      acquire: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(undefined),
    };
    const run = vi.fn(async () => result());

    const out = await runOrchestratedPipeline({ run, notifier, lock });

    expect(out.ok).toBe(true);
    expect(out.skipped).toBeUndefined();
    expect(run).toHaveBeenCalledOnce();
    expect(lock.release).toHaveBeenCalledOnce();
    expect(notifier.notify).toHaveBeenCalledOnce();
  });

  it("lock NÃO adquirida: pula a rodada, não roda, não notifica, não libera", async () => {
    const notifier = fakeNotifier();
    const lock = {
      acquire: vi.fn().mockResolvedValue(false),
      release: vi.fn().mockResolvedValue(undefined),
    };
    const run = vi.fn(async () => result());

    const out = await runOrchestratedPipeline({ run, notifier, lock });

    expect(out.ok).toBe(true);
    expect(out.skipped).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(notifier.notify).not.toHaveBeenCalled();
    // Não adquiriu → não pode liberar a trava de outra rodada.
    expect(lock.release).not.toHaveBeenCalled();
  });

  it("libera a trava mesmo quando o pipeline falha", async () => {
    const notifier = fakeNotifier();
    const lock = {
      acquire: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(undefined),
    };

    const out = await runOrchestratedPipeline({
      run: async () => {
        throw new Error("colapso");
      },
      notifier,
      lock,
    });

    expect(out.ok).toBe(false);
    expect(lock.release).toHaveBeenCalledOnce();
  });
});
