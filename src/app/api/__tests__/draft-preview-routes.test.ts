import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/storage/draft-store");
vi.mock("@/services/publishing", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/publishing/publish-draft")
  >("@/services/publishing/publish-draft");
  return {
    buildDraftSlides: actual.buildDraftSlides,
    resolveFormat: actual.resolveFormat,
    buildRendererFromSettings: vi.fn(),
  };
});

import { projectConfig } from "@config/project.config";
import { GET as previewGET } from "@/app/api/drafts/[id]/preview/route";
import { GET as slidesGET } from "@/app/api/drafts/[id]/slides/route";
import {
  buildRendererFromSettings,
  buildDraftSlides,
} from "@/services/publishing";
import {
  getDraftDetail,
  type DraftDetail,
} from "@/services/storage/draft-store";
import type { PostData, PostImage, PostRenderer } from "@/types";

function detail(): DraftDetail {
  return {
    draft: {
      id: "d1",
      status: "PENDING",
      shortTitle: "Startup levanta investimento em IA",
      caption: "Legenda. Fonte: Portal X",
      hashtags: ["ia"],
      slides: [
        { lead: "Gancho", body: "Parágrafo um." },
        { lead: "Outro", body: "Parágrafo dois.", slideType: "context" },
      ],
      newsItemId: "n1",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    source: "Portal X",
    imageUrl: null,
    publishedAt: new Date("2026-11-18T12:00:00Z"),
  };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/drafts/[id]/preview", () => {
  let renderer: PostRenderer;

  beforeEach(() => {
    vi.resetAllMocks();
    renderer = {
      id: "fake",
      render: vi.fn(
        async (_d: PostData, opts): Promise<PostImage> => ({
          buffer: Buffer.from([0x89, 0x50]),
          width: 1080,
          height: 1350,
          format: opts?.format ?? "square",
        }),
      ),
    };
    vi.mocked(buildRendererFromSettings).mockResolvedValue(renderer);
  });

  it("renderiza o slide N com o mesmo PostData e formato da exportação", async () => {
    const d = detail();
    vi.mocked(getDraftDetail).mockResolvedValue(d);

    const res = await previewGET(
      new Request("http://x/api/drafts/d1/preview?slide=2"),
      ctx("d1"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const [data, opts] = vi.mocked(renderer.render).mock.calls[0]!;
    expect(data).toEqual(buildDraftSlides(d)[1]);
    expect(data.variant).toBe("business");
    expect(opts).toEqual({ format: projectConfig.post.format });
  });

  it("sem ?slide renderiza a capa", async () => {
    const d = detail();
    vi.mocked(getDraftDetail).mockResolvedValue(d);
    await previewGET(new Request("http://x/p"), ctx("d1"));
    expect(vi.mocked(renderer.render).mock.calls[0]![0]).toEqual(
      buildDraftSlides(d)[0],
    );
  });

  it("slide fora do intervalo → 400", async () => {
    vi.mocked(getDraftDetail).mockResolvedValue(detail());
    const res = await previewGET(new Request("http://x/p?slide=99"), ctx("d1"));
    expect(res.status).toBe(400);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("slide inválido (0, texto) → 400", async () => {
    vi.mocked(getDraftDetail).mockResolvedValue(detail());
    for (const q of ["0", "abc"]) {
      const res = await previewGET(
        new Request(`http://x/p?slide=${q}`),
        ctx("d1"),
      );
      expect(res.status).toBe(400);
    }
  });

  it("rascunho inexistente → 404", async () => {
    vi.mocked(getDraftDetail).mockResolvedValue(null);
    const res = await previewGET(new Request("http://x/p"), ctx("nope"));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/drafts/[id]/slides", () => {
  beforeEach(() => vi.resetAllMocks());

  it("devolve total, formato, variante e arquétipo de cada slide", async () => {
    vi.mocked(getDraftDetail).mockResolvedValue(detail());
    const res = await slidesGET(new Request("http://x"), ctx("d1"));
    const body = await res.json();
    expect(body).toEqual({
      total: 3,
      format: projectConfig.post.format,
      variant: "business",
      slides: [
        { index: 1, slideType: "cover" },
        { index: 2, slideType: "context" },
        { index: 3, slideType: "context" },
      ],
    });
  });

  it("404 quando não existe", async () => {
    vi.mocked(getDraftDetail).mockResolvedValue(null);
    const res = await slidesGET(new Request("http://x"), ctx("x"));
    expect(res.status).toBe(404);
  });
});
