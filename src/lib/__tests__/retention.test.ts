import { describe, expect, it } from "vitest";

import {
  daysUntilPurge,
  isPastRetention,
  retentionCutoff,
} from "@/lib/retention";

const now = new Date("2026-11-18T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("retenção de descartados", () => {
  it("conta os dias que faltam e nunca fica negativo", () => {
    expect(daysUntilPurge(daysAgo(0), now, 30)).toBe(30);
    expect(daysUntilPurge(daysAgo(29), now, 30)).toBe(1);
    expect(daysUntilPurge(daysAgo(45), now, 30)).toBe(0);
  });

  it("expira exatamente ao completar o prazo", () => {
    expect(isPastRetention(daysAgo(29.9), now, 30)).toBe(false);
    expect(isPastRetention(daysAgo(30), now, 30)).toBe(true);
  });

  it("data de corte = agora − N dias", () => {
    expect(retentionCutoff(now, 30)).toEqual(daysAgo(30));
  });
});
