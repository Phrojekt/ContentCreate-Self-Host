import { describe, expect, it, vi } from "vitest";

import {
  buildPostData,
  renderPostPackage,
} from "@/services/rendering/post-data";
import type { PostData, PostImage, PostRenderer } from "@/types";

function fakeRenderer(): PostRenderer {
  return {
    id: "fake",
    render: vi.fn(
      async (_data: PostData, opts): Promise<PostImage> => ({
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        width: 1080,
        height: 1080,
        format: opts?.format ?? "square",
      }),
    ),
  };
}

function slide(over: Partial<PostData> = {}): PostData {
  return {
    shortTitle: "Título",
    sourceCredit: "Fonte",
    date: "17 de junho de 2026",
    ...over,
  };
}

describe("buildPostData", () => {
  it("formata a data em pt-BR", () => {
    const data = buildPostData({
      shortTitle: "T",
      sourceCredit: "X",
      date: new Date("2026-06-17T12:00:00Z"),
      locale: "pt-BR",
    });
    expect(data.date).toBe("17 de junho de 2026");
  });

  it("inclui backgroundImageUrl quando informado, omite quando vazio", () => {
    const withImg = buildPostData({
      shortTitle: "T",
      sourceCredit: "X",
      backgroundImageUrl: "https://x.com/a.jpg",
    });
    expect(withImg.backgroundImageUrl).toBe("https://x.com/a.jpg");

    const withoutImg = buildPostData({
      shortTitle: "T",
      sourceCredit: "X",
      backgroundImageUrl: "   ",
    });
    expect(withoutImg.backgroundImageUrl).toBeUndefined();
  });
});

describe("renderPostPackage", () => {
  it("renderiza um post único e monta o pacote", async () => {
    const renderer = fakeRenderer();
    const pkg = await renderPostPackage(renderer, [slide()], {
      caption: "Legenda. Fonte: X",
      hashtags: ["a", "b"],
    });
    expect(pkg.images).toHaveLength(1);
    expect(pkg.caption).toContain("Fonte: X");
    expect(pkg.hashtags).toEqual(["a", "b"]);
    expect(pkg.format).toBe("square");
  });

  it("renderiza um carrossel (N slides) no formato pedido", async () => {
    const renderer = fakeRenderer();
    const pkg = await renderPostPackage(renderer, [slide(), slide(), slide()], {
      caption: "c",
      hashtags: [],
      format: "portrait",
    });
    expect(pkg.images).toHaveLength(3);
    expect(renderer.render).toHaveBeenCalledTimes(3);
    expect(pkg.format).toBe("portrait");
  });

  it("rejeita zero slides", async () => {
    await expect(
      renderPostPackage(fakeRenderer(), [], { caption: "c", hashtags: [] }),
    ).rejects.toThrow(/slide/i);
  });

  it("rejeita carrossel acima de 10 slides", async () => {
    const slides = Array.from({ length: 11 }, () => slide());
    await expect(
      renderPostPackage(fakeRenderer(), slides, { caption: "c", hashtags: [] }),
    ).rejects.toThrow(/limite/i);
  });
});
