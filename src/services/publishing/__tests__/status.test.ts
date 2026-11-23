import { describe, expect, it } from "vitest";

import { decisionFields, nextStatus } from "@/services/publishing/status";

describe("nextStatus", () => {
  it("PENDING → APPROVED ao aprovar", () => {
    expect(nextStatus("PENDING", "approve")).toBe("APPROVED");
  });

  it("PENDING → REJECTED ao rejeitar", () => {
    expect(nextStatus("PENDING", "reject")).toBe("REJECTED");
  });

  it("APPROVED → PUBLISHED ao publicar", () => {
    expect(nextStatus("APPROVED", "publish")).toBe("PUBLISHED");
  });

  it("APPROVED → REJECTED ao rejeitar", () => {
    expect(nextStatus("APPROVED", "reject")).toBe("REJECTED");
  });

  it("rejeita aprovar um rascunho já aprovado", () => {
    expect(() => nextStatus("APPROVED", "approve")).toThrow(
      /Transição inválida/,
    );
  });

  it("rejeita publicar um rascunho ainda PENDING", () => {
    expect(() => nextStatus("PENDING", "publish")).toThrow(/inválida/);
  });

  it("não permite ação sobre rascunho PUBLISHED ou REJECTED", () => {
    expect(() => nextStatus("PUBLISHED", "reject")).toThrow();
    expect(() => nextStatus("REJECTED", "approve")).toThrow();
  });
});

describe("UI-11/UI-12 — restaurar e campos de decisão", () => {
  it("REJECTED → PENDING ao restaurar", () => {
    expect(nextStatus("REJECTED", "restore")).toBe("PENDING");
  });

  it("restore só vale para REJECTED (409 nos demais)", () => {
    for (const s of ["PENDING", "APPROVED", "PUBLISHED"] as const) {
      expect(() => nextStatus(s, "restore")).toThrow(/inválida/);
    }
  });

  it("PUBLISHED continua terminal; REJECTED só aceita restore", () => {
    expect(() => nextStatus("PUBLISHED", "restore")).toThrow();
    expect(() => nextStatus("REJECTED", "publish")).toThrow();
    expect(() => nextStatus("REJECTED", "reject")).toThrow();
  });

  it("decisionFields grava a data certa por status e limpa ao restaurar", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    expect(decisionFields("APPROVED", now)).toEqual({ approvedAt: now });
    expect(decisionFields("PUBLISHED", now)).toEqual({ publishedAt: now });
    expect(
      decisionFields("REJECTED", now, { reason: "weak", note: "  " }),
    ).toEqual({
      rejectedAt: now,
      rejectionReason: "weak",
      rejectionNote: null,
    });
    expect(decisionFields("PENDING", now)).toEqual({
      rejectedAt: null,
      rejectionReason: null,
      rejectionNote: null,
    });
  });
});
