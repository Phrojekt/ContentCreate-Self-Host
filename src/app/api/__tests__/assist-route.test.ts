import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/orchestration", () => ({ buildSlideCompleter: vi.fn() }));
vi.mock("@/services/publishing", async () => ({
  slideSchema: (
    await vi.importActual<typeof import("@/services/publishing/edit-draft")>(
      "@/services/publishing/edit-draft",
    )
  ).slideSchema,
  assistSlide: vi.fn(),
}));

import { POST } from "@/app/api/drafts/[id]/assist/route";
import { assistSlide } from "@/services/publishing";

const post = (body: unknown) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "d1" }) };

describe("POST /api/drafts/[id]/assist (UI-34)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("devolve a sugestão sem gravar", async () => {
    vi.mocked(assistSlide).mockResolvedValue({
      slide: { lead: "a", body: "b" },
      warnings: [],
    });
    const res = await POST(post({ index: 2, instruction: "shorter" }), ctx);
    expect(await res.json()).toEqual({
      ok: true,
      slide: { lead: "a", body: "b" },
      warnings: [],
    });
    expect(vi.mocked(assistSlide).mock.calls[0]!.slice(0, 3)).toEqual([
      "d1",
      2,
      "shorter",
    ]);
  });

  it("instrução desconhecida ou índice inválido → 400", async () => {
    expect(
      (await POST(post({ index: 1, instruction: "poema" }), ctx)).status,
    ).toBe(400);
    expect(
      (await POST(post({ index: 0, instruction: "shorter" }), ctx)).status,
    ).toBe(400);
    expect(assistSlide).not.toHaveBeenCalled();
  });
});
