import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/embedding", () => ({ buildEmbeddingProvider: vi.fn() }));
vi.mock("@/services/publishing", async () => {
  const files = await vi.importActual<
    typeof import("@/services/publishing/exported-files")
  >("@/services/publishing/exported-files");
  return {
    ...files,
    draftEditSchema: (
      await vi.importActual<typeof import("@/services/publishing/edit-draft")>(
        "@/services/publishing/edit-draft",
      )
    ).draftEditSchema,
    editDraft: vi.fn(),
    approveAndExportDraft: vi.fn(),
    buildDefaultPublisher: vi.fn(),
    buildRendererFromSettings: vi.fn(),
    markDraftPublished: vi.fn(),
    rejectDraft: vi.fn(),
    restoreDraft: vi.fn(),
    restoreDrafts: vi.fn(),
    deleteRejectedDrafts: vi.fn(),
    outputDir: vi.fn(),
  };
});

import { POST as bulkPOST } from "@/app/api/drafts/bulk/route";
import {
  PATCH as actionPATCH,
  POST as actionPOST,
} from "@/app/api/drafts/[id]/route";
import { GET as fileGET } from "@/app/api/drafts/[id]/files/[name]/route";
import { AppError } from "@/lib/errors";
import {
  deleteRejectedDrafts,
  editDraft,
  outputDir,
  rejectDraft,
  restoreDraft,
  restoreDrafts,
} from "@/services/publishing";

const post = (body: unknown) =>
  new Request("http://x", {
    method: "POST",
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST /api/drafts/[id] — ações", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reject repassa motivo, nota e learn", async () => {
    const res = await actionPOST(
      post({
        action: "reject",
        reason: "duplicate",
        note: " já saiu ",
        learn: false,
      }),
      ctx("d1"),
    );
    expect(res.status).toBe(200);
    expect(rejectDraft).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({
        reason: "duplicate",
        note: "já saiu",
        learn: false,
      }),
    );
  });

  it("reject sem motivo continua aceito (compatível com a v1)", async () => {
    const res = await actionPOST(post({ action: "reject" }), ctx("d1"));
    expect(res.status).toBe(200);
    const opts = vi.mocked(rejectDraft).mock.calls[0]![1]!;
    expect(opts.reason).toBeUndefined();
  });

  it("motivo fora da lista ou nota longa demais → 400", async () => {
    const bad1 = await actionPOST(
      post({ action: "reject", reason: "preguiça" }),
      ctx("d1"),
    );
    const bad2 = await actionPOST(
      post({ action: "reject", note: "x".repeat(501) }),
      ctx("d1"),
    );
    expect(bad1.status).toBe(400);
    expect(bad2.status).toBe(400);
    expect(rejectDraft).not.toHaveBeenCalled();
  });

  it("restore chama restoreDraft; transição inválida vira 409", async () => {
    const ok = await actionPOST(post({ action: "restore" }), ctx("d1"));
    expect(ok.status).toBe(200);
    expect(restoreDraft).toHaveBeenCalledWith("d1");

    vi.mocked(restoreDraft).mockRejectedValue(
      new AppError("Transição inválida", 409, "INVALID_DRAFT_TRANSITION"),
    );
    const bad = await actionPOST(post({ action: "restore" }), ctx("d1"));
    expect(bad.status).toBe(409);
  });

  it("ação desconhecida → 400", async () => {
    const res = await actionPOST(post({ action: "explode" }), ctx("d1"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/drafts/bulk", () => {
  beforeEach(() => vi.resetAllMocks());

  it("delete usa a pasta de saída e deduplica ids", async () => {
    vi.mocked(outputDir).mockReturnValue("/out");
    vi.mocked(deleteRejectedDrafts).mockResolvedValue(2);
    const res = await bulkPOST(
      post({ action: "delete", ids: ["a", "b", "a"] }),
    );
    expect(await res.json()).toEqual({ ok: true, count: 2 });
    expect(deleteRejectedDrafts).toHaveBeenCalledWith(["a", "b"], {
      outputDir: "/out",
    });
  });

  it("restore em lote", async () => {
    vi.mocked(restoreDrafts).mockResolvedValue(1);
    const res = await bulkPOST(post({ action: "restore", ids: ["a"] }));
    expect(res.status).toBe(200);
    expect(restoreDrafts).toHaveBeenCalledWith(["a"]);
  });

  it("sem ids, mais de 200 ou ação inválida → 400", async () => {
    const many = Array.from({ length: 201 }, (_, i) => `id${i}`);
    for (const body of [
      { action: "delete", ids: [] },
      { action: "delete", ids: many },
      { action: "purge", ids: ["a"] },
    ]) {
      expect((await bulkPOST(post(body))).status).toBe(400);
    }
    expect(deleteRejectedDrafts).not.toHaveBeenCalled();
  });

  it("409 do serviço (algum não descartado) é repassado", async () => {
    vi.mocked(outputDir).mockReturnValue("/out");
    vi.mocked(deleteRejectedDrafts).mockRejectedValue(
      new AppError("só descartados", 409, "DELETE_ONLY_REJECTED"),
    );
    const res = await bulkPOST(post({ action: "delete", ids: ["a"] }));
    expect(res.status).toBe(409);
  });
});

describe("GET /api/drafts/[id]/files/[name]", () => {
  let out: string;
  const fctx = (id: string, name: string) => ({
    params: Promise.resolve({ id, name }),
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    out = await mkdtemp(join(tmpdir(), "cc-files-"));
    await mkdir(join(out, "cmdraft0001"));
    await writeFile(join(out, "cmdraft0001", "slide-2.png"), "PNG");
    await writeFile(join(out, "cmdraft0001", "caption.txt"), "legenda");
    await writeFile(join(out, "cmdraft0001", "post.json"), "{}");
    vi.mocked(outputDir).mockReturnValue(out);
  });

  it("serve slide exportado como PNG para download", async () => {
    const res = await fileGET(
      new Request("http://x"),
      fctx("cmdraft0001", "slide-2.png"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toContain("attachment");
  });

  it("serve caption.txt como texto", async () => {
    const res = await fileGET(
      new Request("http://x"),
      fctx("cmdraft0001", "caption.txt"),
    );
    expect(await res.text()).toBe("legenda");
  });

  it("nomes fora do padrão e path traversal → 400", async () => {
    for (const [id, name] of [
      ["cmdraft0001", "post.json"],
      ["cmdraft0001", "../../.env"],
      ["..", "caption.txt"],
      ["cmdraft0001", "slide-1.png.exe"],
    ] as const) {
      const res = await fileGET(new Request("http://x"), fctx(id, name));
      expect(res.status).toBe(400);
    }
  });

  it("arquivo válido mas inexistente → 404", async () => {
    const res = await fileGET(
      new Request("http://x"),
      fctx("cmdraft0001", "slide-9.png"),
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/drafts/[id] (UI-32)", () => {
  beforeEach(() => vi.resetAllMocks());

  const patchReq = (body: unknown) =>
    new Request("http://x", { method: "PATCH", body: JSON.stringify(body) });

  it("valida e repassa a edição", async () => {
    vi.mocked(editDraft).mockResolvedValue({ warnings: ["aviso"] });
    const res = await actionPATCH(
      patchReq({ caption: "Nova. Fonte: X" }),
      ctx("d1"),
    );
    expect(res.status).toBe(200);
    expect(editDraft).toHaveBeenCalledWith("d1", { caption: "Nova. Fonte: X" });
    expect(await res.json()).toEqual({ ok: true, warnings: ["aviso"] });
  });

  it("legenda acima de 2.200 → 400 sem chamar o serviço", async () => {
    const res = await actionPATCH(
      patchReq({ caption: "x".repeat(2201) }),
      ctx("d1"),
    );
    expect(res.status).toBe(400);
    expect(editDraft).not.toHaveBeenCalled();
  });

  it("409 do serviço (não PENDING) é repassado", async () => {
    vi.mocked(editDraft).mockRejectedValue(
      new AppError("Só pendentes", 409, "EDIT_ONLY_PENDING"),
    );
    const res = await actionPATCH(patchReq({ caption: "x" }), ctx("d1"));
    expect(res.status).toBe(409);
  });
});
