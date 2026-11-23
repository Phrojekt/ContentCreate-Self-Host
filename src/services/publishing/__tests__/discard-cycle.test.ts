import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/storage/draft-store");
vi.mock("@/services/memory");
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AppError } from "@/lib/errors";
import {
  deactivateRejectedLessons,
  recordRejectedLesson,
} from "@/services/memory";
import {
  deleteRejectedDrafts,
  rejectDraft,
  restoreDrafts,
  shouldLearnFromRejection,
} from "@/services/publishing/publish-draft";
import {
  deleteRejectedDraftRecords,
  getDraftDetail,
  getDraftStatuses,
  updateDraftStatus,
  type DraftDetail,
} from "@/services/storage/draft-store";
import type { EmbeddingProvider } from "@/services/embedding";

function detail(): DraftDetail {
  return {
    draft: {
      id: "d1",
      status: "PENDING",
      shortTitle: "Título",
      caption: "Legenda. Fonte: X",
      hashtags: [],
      slides: [],
      newsItemId: "n1",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    source: "X",
    imageUrl: null,
    publishedAt: new Date(),
  };
}

const embedder: EmbeddingProvider = { id: "e", embed: vi.fn() };

describe("UI-10 — descartar com motivo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDraftDetail).mockResolvedValue(detail());
  });

  it("grava motivo, nota e data, e passa o motivo para a lição", async () => {
    await rejectDraft("d1", {
      embedder,
      reason: "weak",
      note: "  só anúncio de evento  ",
    });
    expect(updateDraftStatus).toHaveBeenCalledWith(
      "d1",
      "REJECTED",
      expect.objectContaining({
        rejectionReason: "weak",
        rejectionNote: "só anúncio de evento",
        rejectedAt: expect.any(Date),
      }),
    );
    expect(recordRejectedLesson).toHaveBeenCalledWith(
      embedder,
      expect.anything(),
      "d1",
      { reason: "weak", note: "  só anúncio de evento  " },
    );
  });

  it("learn: false não grava lição", async () => {
    await rejectDraft("d1", { embedder, reason: "tone", learn: false });
    expect(updateDraftStatus).toHaveBeenCalled();
    expect(recordRejectedLesson).not.toHaveBeenCalled();
  });

  it("motivo design não vira lição de conteúdo", async () => {
    await rejectDraft("d1", { embedder, reason: "design" });
    expect(recordRejectedLesson).not.toHaveBeenCalled();
  });

  it("regra pura de aprendizado", () => {
    expect(shouldLearnFromRejection({})).toBe(true);
    expect(shouldLearnFromRejection({ reason: "copied" })).toBe(true);
    expect(shouldLearnFromRejection({ reason: "design" })).toBe(false);
    expect(shouldLearnFromRejection({ learn: false })).toBe(false);
  });
});

describe("UI-11 — restaurar descartado", () => {
  beforeEach(() => vi.resetAllMocks());

  it("volta para PENDING, limpa motivo e desativa a lição", async () => {
    vi.mocked(getDraftStatuses).mockResolvedValue([
      { id: "a", status: "REJECTED" },
      { id: "b", status: "REJECTED" },
    ]);
    const n = await restoreDrafts(["a", "b"]);
    expect(n).toBe(2);
    expect(updateDraftStatus).toHaveBeenCalledWith("a", "PENDING", {
      rejectedAt: null,
      rejectionReason: null,
      rejectionNote: null,
    });
    expect(deactivateRejectedLessons).toHaveBeenCalledWith(["a", "b"]);
  });

  it("409 e nada muda se algum não estiver REJECTED", async () => {
    vi.mocked(getDraftStatuses).mockResolvedValue([
      { id: "a", status: "REJECTED" },
      { id: "b", status: "APPROVED" },
    ]);
    await expect(restoreDrafts(["a", "b"])).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(updateDraftStatus).not.toHaveBeenCalled();
    expect(deactivateRejectedLessons).not.toHaveBeenCalled();
  });

  it("404 para id inexistente", async () => {
    vi.mocked(getDraftStatuses).mockResolvedValue([]);
    await expect(restoreDrafts(["zz"])).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("falha ao desativar a lição não desfaz a restauração (best-effort)", async () => {
    vi.mocked(getDraftStatuses).mockResolvedValue([
      { id: "a", status: "REJECTED" },
    ]);
    vi.mocked(deactivateRejectedLessons).mockRejectedValue(new Error("db"));
    await expect(restoreDrafts(["a"])).resolves.toBe(1);
  });
});

describe("UI-13 — excluir de vez", () => {
  beforeEach(() => vi.resetAllMocks());

  it("apaga os registros e só as pastas exportadas dos ids", async () => {
    const out = await mkdtemp(join(tmpdir(), "cc-out-"));
    await mkdir(join(out, "cmabc12345"));
    await writeFile(join(out, "cmabc12345", "slide-1.png"), "x");
    await mkdir(join(out, "outro-rascunho"));
    vi.mocked(deleteRejectedDraftRecords).mockResolvedValue(1);

    const n = await deleteRejectedDrafts(["cmabc12345"], { outputDir: out });

    expect(n).toBe(1);
    expect(deleteRejectedDraftRecords).toHaveBeenCalledWith(["cmabc12345"]);
    expect(await readdir(out)).toEqual(["outro-rascunho"]);
  });

  it("não remove nada do disco quando o banco recusa (409)", async () => {
    const out = await mkdtemp(join(tmpdir(), "cc-out-"));
    await mkdir(join(out, "cmabc12345"));
    vi.mocked(deleteRejectedDraftRecords).mockRejectedValue(
      new AppError("só descartados", 409, "DELETE_ONLY_REJECTED"),
    );
    await expect(
      deleteRejectedDrafts(["cmabc12345"], { outputDir: out }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await readdir(out)).toEqual(["cmabc12345"]);
  });

  it("ignora ids inseguros ao montar caminho (path traversal)", async () => {
    const out = await mkdtemp(join(tmpdir(), "cc-out-"));
    await mkdir(join(out, "keep"));
    vi.mocked(deleteRejectedDraftRecords).mockResolvedValue(1);
    await deleteRejectedDrafts(["../keep"], { outputDir: out });
    expect(await readdir(out)).toEqual(["keep"]);
  });
});
