import { describe, expect, it, vi } from "vitest";

import { SatoriRenderer } from "@/services/rendering/satori-renderer";
import type { PostData } from "@/types";

// Assinatura PNG (8 bytes). Prova que o pipeline Satori→SVG→resvg gerou raster.
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(buffer: Buffer): boolean {
  return PNG_MAGIC.every((byte, i) => buffer[i] === byte);
}

const baseData: PostData = {
  shortTitle: "Brasil registra recorde de energia solar em 2026",
  sourceCredit: "Portal Energia",
  date: "17 de junho de 2026",
};

describe("SatoriRenderer (integração)", () => {
  it("renderiza um PNG 1080x1080 sem imagem de fundo", async () => {
    const renderer = new SatoriRenderer();
    const image = await renderer.render(baseData, { format: "square" });

    expect(isPng(image.buffer)).toBe(true);
    expect(image.width).toBe(1080);
    expect(image.height).toBe(1080);
    expect(image.format).toBe("square");
  }, 20_000);

  it("renderiza retrato 1080x1350", async () => {
    const renderer = new SatoriRenderer();
    const image = await renderer.render(baseData, { format: "portrait" });
    expect(isPng(image.buffer)).toBe(true);
    expect(image.height).toBe(1350);
  }, 20_000);

  it("cai para fundo sólido quando a imagem de fundo falha (robustez)", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("rede indisponível"));
    const renderer = new SatoriRenderer({ fetchFn });

    const image = await renderer.render(
      { ...baseData, backgroundImageUrl: "https://inalcancavel.example/x.jpg" },
      { format: "square" },
    );

    expect(isPng(image.buffer)).toBe(true);
    expect(fetchFn).toHaveBeenCalledOnce();
  }, 20_000);
});
