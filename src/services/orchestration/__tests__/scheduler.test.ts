import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { startScheduler } from "@/services/orchestration/scheduler";

describe("startScheduler", () => {
  it("registra a tarefa no cron quando a expressão é válida", () => {
    const scheduleFn = vi.fn();
    startScheduler({
      cronExpr: "0 8 * * *",
      task: vi.fn().mockResolvedValue(undefined),
      validate: () => true,
      scheduleFn,
    });
    expect(scheduleFn).toHaveBeenCalledOnce();
    expect(scheduleFn.mock.calls[0]![0]).toBe("0 8 * * *");
  });

  it("rejeita expressão cron inválida (falha cedo)", () => {
    const scheduleFn = vi.fn();
    expect(() =>
      startScheduler({
        cronExpr: "isto não é cron",
        task: vi.fn(),
        validate: () => false,
        scheduleFn,
      }),
    ).toThrow(/cron inválida/);
    expect(scheduleFn).not.toHaveBeenCalled();
  });

  it("o disparo executa a tarefa e blinda erros (não derruba o agendador)", async () => {
    let registered: (() => void) | undefined;
    const scheduleFn = (_expr: string, task: () => void) => {
      registered = task;
    };
    const task = vi.fn().mockRejectedValue(new Error("rodada falhou"));

    startScheduler({
      cronExpr: "* * * * *",
      task,
      validate: () => true,
      scheduleFn,
    });

    expect(registered).toBeTypeOf("function");
    // Dispara o callback do cron; não deve lançar mesmo com task rejeitando.
    expect(() => registered!()).not.toThrow();
    await Promise.resolve();
    expect(task).toHaveBeenCalledOnce();
  });
});
