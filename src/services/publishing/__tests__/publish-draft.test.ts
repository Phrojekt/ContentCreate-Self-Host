import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockedFunction } from "vitest";

vi.mock("@/services/storage/draft-store");
vi.mock("@/services/memory");
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  getDraftDetail,
  updateDraftStatus,
  type DraftDetail,
} from "@/services/storage/draft-store";
import { recordApprovedExample, recordRejectedLesson } from "@/services/memory";
import { projectConfig } from "@config/project.config";
import {
  approveAndExportDraft,
  buildDraftSlides,
  markDraftPublished,
  rejectDraft,
  resolveFormat,
} from "@/services/publishing/publish-draft";
import type {
  DraftStatus,
  PostData,
  PostImage,
  PostRenderer,
  Publisher,
} from "@/types";
import type { EmbeddingProvider } from "@/services/embedding";

function detail(status: DraftStatus): DraftDetail {
  return {
    draft: {
      id: "d1",
      status,
      shortTitle: "Título do post",
      caption: "Legenda. Fonte: Portal X",
      hashtags: ["a", "b"],
      slides: [],
      newsItemId: "n1",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    source: "Portal X",
    imageUrl: null,
    publishedAt: new Date("2026-06-17T12:00:00Z"),
  };
}

function fakeRenderer(): PostRenderer {
  return {
    id: "fake",
    render: vi.fn(
      async (_d: PostData, opts): Promise<PostImage> => ({
        buffer: Buffer.from([0x89]),
        width: 1080,
        height: 1080,
        format: opts?.format ?? "square",
      }),
    ),
  };
}

function fakePublisher(): Publisher {
  return {
    id: "fake-pub",
    publish: vi.fn().mockResolvedValue({
      target: "fake-pub",
      location: "/out/d1",
      files: ["/out/d1/post.png"],
    }),
  };
}

const getMock = getDraftDetail as MockedFunction<typeof getDraftDetail>;
const updateMock = updateDraftStatus as MockedFunction<
  typeof updateDraftStatus
>;

describe("publish-draft", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    updateMock.mockResolvedValue(undefined);
  });

  it("aprova: renderiza, publica e marca APPROVED", async () => {
    getMock.mockResolvedValue(detail("PENDING"));
    const renderer = fakeRenderer();
    const publisher = fakePublisher();

    const result = await approveAndExportDraft("d1", { renderer, publisher });

    // Carrossel: 1+ renders (capa + corpo); 1 publicação do pacote completo.
    expect(renderer.render).toHaveBeenCalled();
    expect(publisher.publish).toHaveBeenCalledOnce();
    expect(updateMock).toHaveBeenCalledWith(
      "d1",
      "APPROVED",
      expect.objectContaining({ approvedAt: expect.any(Date) }),
    );
    expect(result.location).toBe("/out/d1");
  });

  it("não marca APPROVED se a publicação falhar (mantém PENDING)", async () => {
    getMock.mockResolvedValue(detail("PENDING"));
    const renderer = fakeRenderer();
    const publisher: Publisher = {
      id: "x",
      publish: vi.fn().mockRejectedValue(new Error("disco cheio")),
    };

    await expect(
      approveAndExportDraft("d1", { renderer, publisher }),
    ).rejects.toThrow(/disco cheio/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejeita um rascunho PENDING → REJECTED", async () => {
    getMock.mockResolvedValue(detail("PENDING"));
    await rejectDraft("d1");
    expect(updateMock).toHaveBeenCalledWith(
      "d1",
      "REJECTED",
      expect.objectContaining({
        rejectedAt: expect.any(Date),
        rejectionReason: null,
      }),
    );
  });

  it("marca APPROVED como PUBLISHED", async () => {
    getMock.mockResolvedValue(detail("APPROVED"));
    await markDraftPublished("d1");
    expect(updateMock).toHaveBeenCalledWith(
      "d1",
      "PUBLISHED",
      expect.objectContaining({ publishedAt: expect.any(Date) }),
    );
  });

  it("recusa aprovar um rascunho já APPROVED (transição inválida)", async () => {
    getMock.mockResolvedValue(detail("APPROVED"));
    const publisher = fakePublisher();

    await expect(
      approveAndExportDraft("d1", { renderer: fakeRenderer(), publisher }),
    ).rejects.toThrow(/inválida/);
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("404 quando o rascunho não existe", async () => {
    getMock.mockResolvedValue(null);
    await expect(rejectDraft("missing")).rejects.toThrow(/não encontrado/);
  });

  it("aprovar com embedder grava exemplo episódico (DEC-020)", async () => {
    getMock.mockResolvedValue(detail("PENDING"));
    const embedder: EmbeddingProvider = { id: "fake-embed", embed: vi.fn() };

    await approveAndExportDraft("d1", {
      renderer: fakeRenderer(),
      publisher: fakePublisher(),
      embedder,
    });

    expect(recordApprovedExample).toHaveBeenCalledWith(
      embedder,
      expect.objectContaining({ source: "Portal X" }),
      "d1",
    );
  });

  it("rejeitar com embedder grava lição procedural (DEC-020)", async () => {
    getMock.mockResolvedValue(detail("PENDING"));
    const embedder: EmbeddingProvider = { id: "fake-embed", embed: vi.fn() };

    await rejectDraft("d1", { embedder });

    expect(recordRejectedLesson).toHaveBeenCalledWith(
      embedder,
      expect.objectContaining({ source: "Portal X" }),
      "d1",
      { reason: null, note: null },
    );
  });

  it("falha ao gravar memória não bloqueia a aprovação (best-effort)", async () => {
    getMock.mockResolvedValue(detail("PENDING"));
    vi.mocked(recordApprovedExample).mockRejectedValue(new Error("boom"));
    const embedder: EmbeddingProvider = { id: "fake-embed", embed: vi.fn() };

    const result = await approveAndExportDraft("d1", {
      renderer: fakeRenderer(),
      publisher: fakePublisher(),
      embedder,
    });

    expect(result.location).toBe("/out/d1");
    expect(updateMock).toHaveBeenCalledWith(
      "d1",
      "APPROVED",
      expect.objectContaining({ approvedAt: expect.any(Date) }),
    );
  });

  it("sem embedder, não tenta gravar memória", async () => {
    getMock.mockResolvedValue(detail("PENDING"));
    await rejectDraft("d1");
    expect(recordRejectedLesson).not.toHaveBeenCalled();
  });
});

describe("buildDraftSlides — preview fiel ao exportado (UI-03)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    updateMock.mockResolvedValue(undefined);
  });

  function richDetail(): DraftDetail {
    const d = detail("PENDING");
    d.draft.shortTitle = "Empresa anuncia novo modelo de IA";
    d.draft.slides = [
      { lead: "O que muda", body: "Primeiro parágrafo com fatos." },
      {
        lead: "Números",
        body: "Segundo parágrafo com dados.",
        slideType: "stat",
        stat: { value: "42%", label: "de ganho" },
      },
    ];
    return d;
  }

  it("a exportação envia ao renderer exatamente os slides de buildDraftSlides, no formato da config", async () => {
    const d = richDetail();
    getMock.mockResolvedValue(d);
    const renderer = fakeRenderer();

    await approveAndExportDraft("d1", {
      renderer,
      publisher: fakePublisher(),
    });

    const expected = buildDraftSlides(d);
    const calls = vi.mocked(renderer.render).mock.calls;
    expect(calls.map((c) => c[0])).toEqual(expected);
    for (const c of calls) {
      expect(c[1]).toEqual({ format: projectConfig.post.format });
    }
  });

  it("todos os slides levam a variante da categoria (cor), não só a capa", () => {
    const slides = buildDraftSlides(richDetail());
    expect(slides.length).toBe(3); // capa + 2 corpo
    expect(new Set(slides.map((s) => s.variant))).toEqual(
      new Set(["breaking"]),
    );
    expect(slides[2]?.slideType).toBe("stat");
  });

  it("resolveFormat usa a config por padrão e respeita override", () => {
    expect(resolveFormat()).toBe(projectConfig.post.format);
    expect(resolveFormat("square")).toBe("square");
  });
});
