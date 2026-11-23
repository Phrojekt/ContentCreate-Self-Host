import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/orchestration", () => ({ generateFromLinkOnce: vi.fn() }));

import { POST } from "@/app/api/drafts/from-link/route";
import { AppError } from "@/lib/errors";
import { generateFromLinkOnce } from "@/services/orchestration";

const post = (body: unknown) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/drafts/from-link", () => {
  beforeEach(() => vi.resetAllMocks());

  it("devolve o resultado do serviço", async () => {
    vi.mocked(generateFromLinkOnce).mockResolvedValue({
      title: "T",
      source: "exame.com",
      qualityScore: 90,
    });
    const res = await POST(post({ url: " https://exame.com/a " }));
    expect(res.status).toBe(200);
    expect(generateFromLinkOnce).toHaveBeenCalledWith("https://exame.com/a");
  });

  it("corpo sem url → 400; erro de domínio é repassado", async () => {
    expect((await POST(post({}))).status).toBe(400);
    vi.mocked(generateFromLinkOnce).mockRejectedValue(
      new AppError("ilegível", 422, "LINK_UNREADABLE"),
    );
    expect((await POST(post({ url: "https://x.com" }))).status).toBe(422);
  });
});
