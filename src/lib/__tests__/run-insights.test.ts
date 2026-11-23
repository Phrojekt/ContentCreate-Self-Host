import { describe, expect, it } from "vitest";

import { qualityChecks } from "@/lib/quality-checks";
import {
  buildBriefing,
  cronToPhrase,
  dropReasons,
  greeting,
  runFunnel,
  type RunSummary,
} from "@/lib/run-insights";

const now = new Date(2026, 10, 18, 14, 0);

function run(over: Partial<RunSummary> = {}): RunSummary {
  return {
    startedAt: new Date(now.getTime() - 6 * 3_600_000),
    status: "OK",
    collected: 142,
    afterDedup: 120,
    afterFilter: 31,
    afterAlreadyProcessed: 20,
    afterSemantic: 18,
    selected: 15,
    skippedThinContent: 8,
    draftsCreated: 7,
    errors: [],
    failure: null,
    ...over,
  };
}

describe("buildBriefing (UI-22, sem LLM)", () => {
  it("sem rodada registrada → boas-vindas", () => {
    const b = buildBriefing(null, 0, 0, now);
    expect(b.headline).toBe("Boa tarde. Nenhum rascunho esperando.");
    expect(b.body).toMatch(/Ainda não há rodadas registradas/);
  });

  it("resume a rodada com números reais e nota baixa", () => {
    const b = buildBriefing(run(), 7, 2, now);
    expect(b.headline).toBe("Boa tarde. Você tem 7 rascunhos esperando.");
    expect(b.body).toContain("das 142 notícias coletadas, 7 viraram rascunho");
    expect(b.body).toContain("8 notícias ficaram de fora por ter texto curto");
    expect(b.body).toContain(
      "2 rascunhos pendentes ficaram com nota abaixo do piso",
    );
  });

  it("singular e sem nota baixa", () => {
    const b = buildBriefing(
      run({ skippedThinContent: 0, draftsCreated: 1 }),
      1,
      0,
      now,
    );
    expect(b.headline).toBe("Boa tarde. Você tem 1 rascunho esperando.");
    expect(b.body).toContain("1 virou rascunho");
    expect(b.body).toContain("Todos os pendentes passaram");
  });

  it("não afirma que todos passaram se há pendentes sem nota", () => {
    const b = buildBriefing(run(), 3, 0, now, 1);
    expect(b.body).not.toContain("Todos os pendentes passaram");
  });

  it("rodada que falhou mostra o motivo", () => {
    const b = buildBriefing(
      run({ status: "FAILED", draftsCreated: 0, failure: "RSS fora do ar" }),
      0,
      0,
      now,
    );
    expect(b.body).toContain("falhou: RSS fora do ar");
  });

  it("saudação por horário", () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe("Bom dia");
    expect(greeting(new Date(2026, 0, 1, 20))).toBe("Boa noite");
  });
});

describe("funil e motivos de saída (UI-22/UI-23)", () => {
  it("4 etapas com quedas coerentes", () => {
    const f = runFunnel(run());
    expect(f.map((s) => s.value)).toEqual([142, 31, 15, 7]);
    expect(f[1]!.note).toBe("−111 duplicadas ou fora do tema");
    expect(f[3]!.note).toBe("−8 texto curto · −0 com erro");
  });

  it("dropReasons soma exatamente coletadas − rascunhos", () => {
    const r = run();
    const d = dropReasons(r);
    expect(d.total).toBe(r.collected - r.draftsCreated);
    expect(
      d.reasons.find((x) => x.label.startsWith("Fora do tema"))!.count,
    ).toBe(89);
    expect(d.reasons.every((x) => x.count > 0)).toBe(true);
  });
});

describe("cronToPhrase (UI-23)", () => {
  it.each([
    ["0 8 * * *", "Todo dia às 08:00"],
    ["30 7 * * 1-5", "De segunda a sexta às 07:30"],
    ["0 9 * * 6-0", "De sábado a domingo às 09:00"],
    ["0 8,18 * * *", "Todo dia às 08:00 e 18:00"],
    ["15 6 * * 1,3,5", "Toda segunda, quarta e sexta às 06:15"],
  ])("%s → %s", (expr, phrase) => {
    expect(cronToPhrase(expr)).toBe(phrase);
  });

  it.each(["*/5 * * * *", "0 8 1 * *", "lixo", "61 8 * * *"])(
    "%s não é traduzido (mostra cru)",
    (expr) => {
      expect(cronToPhrase(expr)).toBeNull();
    },
  );
});

describe("qualityChecks (UI-21)", () => {
  it("traduz breakdown em ok/warn/bad e usa a violação como explicação", () => {
    const checks = qualityChecks({
      breakdown: { language: 20, originality: 0, lastSlide: 15 },
      violations: [
        "Originalidade: 40% de cópia literal da fonte",
        "Último slide: pergunta de engajamento ausente",
      ],
    });
    expect(checks.map((c) => [c.key, c.state])).toEqual([
      ["language", "ok"],
      ["originality", "bad"],
      ["lastSlide", "warn"],
    ]);
    expect(checks[1]!.note).toContain("cópia literal");
    expect(checks[2]!.note).toContain("pergunta de engajamento");
  });
});
