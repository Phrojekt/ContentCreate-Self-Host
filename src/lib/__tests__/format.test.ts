import { describe, expect, it } from "vitest";

import { formatAge, formatUsd } from "@/lib/format";

const now = new Date("2026-11-18T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("formatAge", () => {
  it("menos de 1 minuto → agora", () => {
    expect(formatAge(ago(30_000), now)).toBe("agora");
  });
  it("minutos, horas e dias", () => {
    expect(formatAge(ago(5 * 60_000), now)).toBe("há 5 min");
    expect(formatAge(ago(6 * 3_600_000), now)).toBe("há 6 h");
    expect(formatAge(ago(24 * 3_600_000), now)).toBe("há 1 dia");
    expect(formatAge(ago(3 * 24 * 3_600_000), now)).toBe("há 3 dias");
  });
  it("data no futuro não gera idade negativa", () => {
    expect(formatAge(new Date(now.getTime() + 60_000), now)).toBe("agora");
  });
});

describe("formatUsd", () => {
  it("usa 4 casas para valores muito pequenos e 2 para os demais", () => {
    expect(formatUsd(0.0042)).toBe("US$ 0,0042");
    expect(formatUsd(1.5)).toBe("US$ 1,50");
    expect(formatUsd(0)).toBe("US$ 0,00");
  });
});
