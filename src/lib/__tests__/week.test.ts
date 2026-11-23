import { describe, expect, it } from "vitest";

import {
  isInWeek,
  parseWeekParam,
  startOfWeek,
  toIsoDay,
  weekDays,
  weekLabel,
} from "@/lib/week";

describe("semana da Agenda", () => {
  it("começa na segunda-feira", () => {
    // 2026-11-18 é quarta-feira.
    expect(toIsoDay(startOfWeek(new Date(2026, 10, 18, 15)))).toBe(
      "2026-11-16",
    );
    // Domingo pertence à semana que começou na segunda anterior.
    expect(toIsoDay(startOfWeek(new Date(2026, 10, 22, 9)))).toBe("2026-11-16");
  });

  it("tem 7 dias e testa pertencimento", () => {
    const start = startOfWeek(new Date(2026, 10, 18));
    expect(weekDays(start).map(toIsoDay)).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
    expect(isInWeek(new Date(2026, 10, 22, 23, 59), start)).toBe(true);
    expect(isInWeek(new Date(2026, 10, 23, 0, 0), start)).toBe(false);
  });

  it("parâmetro inválido cai na semana atual", () => {
    const now = new Date(2026, 10, 18);
    expect(toIsoDay(parseWeekParam("lixo", now))).toBe("2026-11-16");
    expect(toIsoDay(parseWeekParam("2026-11-26", now))).toBe("2026-11-23");
  });

  it("rótulo legível", () => {
    expect(weekLabel(new Date(2026, 10, 16))).toBe("16 – 22 de novembro");
    expect(weekLabel(new Date(2026, 9, 26))).toBe(
      "26 de outubro – 1 de novembro",
    );
  });
});
