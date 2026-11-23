import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/memory", () => ({
  listMemoryEntries: vi.fn(),
  setMemoryEntryActive: vi.fn(),
}));
vi.mock("@/services/publishing", () => ({
  buildRendererFromSettings: vi.fn(),
  resolveFormat: () => "portrait",
}));

import { GET as brandGET } from "@/app/api/brand/sample/route";
import { PATCH as memoryPATCH } from "@/app/api/memory/[id]/route";
import { GET as memoryGET } from "@/app/api/memory/route";
import { buildRendererFromSettings } from "@/services/publishing";
import { listMemoryEntries, setMemoryEntryActive } from "@/services/memory";

const patch = (body: unknown) =>
  new Request("http://x", { method: "PATCH", body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/memory", () => {
  beforeEach(() => vi.resetAllMocks());

  it("repassa filtros validados", async () => {
    vi.mocked(listMemoryEntries).mockResolvedValue([]);
    const res = await memoryGET(
      new Request(
        "http://x/api/memory?source=FEEDBACK_REJECTED&active=false&limit=5",
      ),
    );
    expect(res.status).toBe(200);
    expect(listMemoryEntries).toHaveBeenCalledWith({
      source: "FEEDBACK_REJECTED",
      active: false,
      limit: 5,
    });
  });

  it("filtro inválido → 400", async () => {
    const res = await memoryGET(new Request("http://x/api/memory?source=HACK"));
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/memory/[id]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("desativa uma entrada", async () => {
    vi.mocked(setMemoryEntryActive).mockResolvedValue(true);
    const res = await memoryPATCH(patch({ active: false }), ctx("manual:r1"));
    expect(res.status).toBe(200);
    expect(setMemoryEntryActive).toHaveBeenCalledWith("manual:r1", false);
  });

  it("corpo inválido → 400; id inexistente → 404", async () => {
    expect((await memoryPATCH(patch({ active: "sim" }), ctx("x"))).status).toBe(
      400,
    );
    vi.mocked(setMemoryEntryActive).mockResolvedValue(false);
    expect((await memoryPATCH(patch({ active: true }), ctx("x"))).status).toBe(
      404,
    );
  });
});

describe("GET /api/brand/sample", () => {
  beforeEach(() => vi.resetAllMocks());

  it("renderiza a capa de demonstração com a variante pedida", async () => {
    const render = vi.fn().mockResolvedValue({
      buffer: Buffer.from([1]),
      width: 1080,
      height: 1350,
      format: "portrait",
    });
    vi.mocked(buildRendererFromSettings).mockResolvedValue({ id: "f", render });
    const res = await brandGET(new Request("http://x?variant=data"));
    expect(res.status).toBe(200);
    expect(render.mock.calls[0]![0].variant).toBe("data");
    expect(render.mock.calls[0]![1]).toEqual({ format: "portrait" });
  });

  it("id malformado → 400 (categoria desconhecida cai na padrão no renderer)", async () => {
    const res = await brandGET(new Request("http://x?variant=../neon"));
    expect(res.status).toBe(400);
  });
});
