import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/storage/draft-store");
vi.mock("@/services/memory");
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  archetypeErrors,
  draftEditSchema,
  editDraft,
} from "@/services/publishing/edit-draft";
import { purgeExpiredRejected } from "@/services/publishing/publish-draft";
import {
  deleteRejectedDraftRecords,
  getDraftDetail,
  listRejectedDecidedBefore,
  updateDraftContent,
  type DraftDetail,
} from "@/services/storage/draft-store";
import type { DraftStatus } from "@/types";

function detail(status: DraftStatus = "PENDING"): DraftDetail {
  return {
    draft: {
      id: "d1",
      status,
      shortTitle: "Título original",
      caption: "Legenda. Fonte: X",
      hashtags: ["ia"],
      slides: [
        { lead: "Gancho", body: "Corpo um." },
        { lead: "Outro", body: "Corpo dois.", slideType: "context" },
      ],
      newsItemId: "n1",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    source: "X",
    imageUrl: null,
    publishedAt: new Date(),
  };
}

describe("UI-32 — editar rascunho", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDraftDetail).mockResolvedValue(detail());
    vi.mocked(updateDraftContent).mockResolvedValue(true);
  });

  it("sanitiza como a saída do LLM e marca editedAt", async () => {
    const now = new Date("2026-11-18T12:00:00Z");
    await editDraft(
      "d1",
      {
        shortTitle: "  <b>Novo</b> título ",
        hashtags: ["#IA", "ia", "dados novos"],
        slides: [{ lead: "", body: "Texto <i>revisado</i>." }],
      },
      now,
    );
    expect(updateDraftContent).toHaveBeenCalledWith(
      "d1",
      {
        shortTitle: "Novo título",
        hashtags: ["IA", "dadosnovos"],
        slides: [{ lead: "", body: "Texto revisado." }],
      },
      now,
    );
  });

  it("só grava os campos enviados", async () => {
    await editDraft("d1", { caption: "Nova legenda. Fonte: X" });
    const patch = vi.mocked(updateDraftContent).mock.calls[0]![1];
    expect(Object.keys(patch)).toEqual(["caption"]);
  });

  it("409 se o rascunho não está PENDING", async () => {
    vi.mocked(getDraftDetail).mockResolvedValue(detail("APPROVED"));
    await expect(editDraft("d1", { caption: "x" })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(updateDraftContent).not.toHaveBeenCalled();
  });

  it("409 se o status mudou durante a edição (corrida)", async () => {
    vi.mocked(updateDraftContent).mockResolvedValue(false);
    await expect(editDraft("d1", { caption: "x" })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("404 se não existe", async () => {
    vi.mocked(getDraftDetail).mockResolvedValue(null);
    await expect(editDraft("zz", {})).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("arquétipo incompleto NÃO bloqueia: grava como contexto e devolve aviso", async () => {
    const res = await editDraft("d1", {
      slides: [
        {
          lead: "",
          body: "Texto.",
          slideType: "stat",
          stat: { value: "", label: "x" },
        },
      ],
    });
    expect(res.warnings[0]).toContain("Slide 2 (número");
    expect(vi.mocked(updateDraftContent).mock.calls[0]![1].slides).toEqual([
      { lead: "", body: "Texto.", slideType: "context" },
    ]);
  });

  it("regressão: rascunho real do LLM (arquétipos sem dados, gancho longo) salva", async () => {
    const llmSlides = [
      {
        lead: "Reutilização",
        body: "4 estruturas de vídeo foram criadas para futuros lançamentos.",
        slideType: "stat" as const,
        eyebrow: "4 VÍDEOS",
      },
      {
        lead: "Comparação de animações",
        body: "Spring 8 oscila e Spring 20 permanece estático.",
        slideType: "comparison" as const,
      },
      {
        lead: "G".repeat(260),
        body: "‘O maior problema não é a animação.’ — Trainee, Analytics Vidhya",
        slideType: "quote" as const,
      },
      { lead: "Fecho", body: "Siga para mais.", slideType: "closing" as const },
    ];
    const parsed = draftEditSchema.parse({ slides: llmSlides });
    const res = await editDraft("d1", parsed);
    const saved = vi.mocked(updateDraftContent).mock.calls[0]![1].slides!;
    expect(saved.map((x) => x.slideType)).toEqual([
      "context",
      "context",
      "context",
      "closing",
    ]);
    expect(saved[0]!.eyebrow).toBe("4 VÍDEOS");
    expect(res.warnings).toHaveLength(3);
  });

  it("arquétipo completo é mantido sem aviso", async () => {
    const res = await editDraft("d1", {
      slides: [
        {
          lead: "",
          body: "Texto.",
          slideType: "stat",
          stat: { value: "42%", label: "menos custo" },
        },
      ],
    });
    expect(res.warnings).toEqual([]);
    expect(
      vi.mocked(updateDraftContent).mock.calls[0]![1].slides![0]!.slideType,
    ).toBe("stat");
  });

  it("slide que vira vazio depois da limpeza (só HTML) → 400", async () => {
    await expect(
      editDraft("d1", { slides: [{ lead: "", body: "<br>" }] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("archetypeErrors cobre comparação e citação", () => {
    expect(
      archetypeErrors([
        {
          lead: "",
          body: "b",
          slideType: "comparison",
          comparison: {
            leftLabel: "A",
            leftValue: "",
            rightLabel: "B",
            rightValue: "2",
          },
        },
        {
          lead: "",
          body: "b",
          slideType: "quote",
          quote: { text: "t", author: "", role: "r" },
        },
        { lead: "", body: "b", slideType: "context" },
      ]),
    ).toEqual([
      "Slide 2 (comparação: preencha os dois lados (rótulo e valor)) — até lá ele aparece como contexto.",
      "Slide 3 (citação: preencha a frase, o autor e o cargo) — até lá ele aparece como contexto.",
    ]);
  });

  it("schema: limites do Instagram (legenda 2.200, 30 hashtags)", () => {
    expect(
      draftEditSchema.safeParse({ caption: "x".repeat(2201) }).success,
    ).toBe(false);
    expect(
      draftEditSchema.safeParse({
        hashtags: Array.from({ length: 31 }, (_, i) => `t${i}`),
      }).success,
    ).toBe(false);
    expect(draftEditSchema.safeParse({ shortTitle: "  " }).success).toBe(false);
    expect(
      draftEditSchema.safeParse({ slides: [{ lead: "", body: "" }] }).success,
    ).toBe(false);
    expect(draftEditSchema.safeParse({ caption: "ok" }).success).toBe(true);
  });
});

describe("UI-30 — expurgo automático", () => {
  beforeEach(() => vi.resetAllMocks());

  it("exclui os descartados anteriores ao corte (agora − N dias)", async () => {
    const now = new Date("2026-11-18T12:00:00Z");
    vi.mocked(listRejectedDecidedBefore).mockResolvedValue([
      "a1234567",
      "b1234567",
    ]);
    vi.mocked(deleteRejectedDraftRecords).mockResolvedValue(2);

    const n = await purgeExpiredRejected(now, 30);

    expect(n).toBe(2);
    expect(listRejectedDecidedBefore).toHaveBeenCalledWith(
      new Date("2026-10-19T12:00:00Z"),
    );
    expect(deleteRejectedDraftRecords).toHaveBeenCalledWith([
      "a1234567",
      "b1234567",
    ]);
  });

  it("nada vencido → não chama a exclusão", async () => {
    vi.mocked(listRejectedDecidedBefore).mockResolvedValue([]);
    expect(await purgeExpiredRejected(new Date(), 30)).toBe(0);
    expect(deleteRejectedDraftRecords).not.toHaveBeenCalled();
  });
});
