import { describe, expect, it, vi } from "vitest";

import { OllamaEmbeddingProvider } from "@/services/embedding/ollama-embedding-provider";

function embedResponse(embeddings: number[][]): Response {
  return new Response(JSON.stringify({ embeddings }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OllamaEmbeddingProvider", () => {
  it("retorna [] sem chamar a rede quando não há textos", async () => {
    const fetchFn = vi.fn();
    const provider = new OllamaEmbeddingProvider({ fetchFn });
    expect(await provider.embed([])).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("envia model + input e devolve os vetores", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      embedResponse([
        [0.1, 0.2],
        [0.3, 0.4],
      ]),
    );
    const provider = new OllamaEmbeddingProvider({
      model: "nomic-embed-text",
      fetchFn,
    });

    const out = await provider.embed(["um", "dois"]);

    expect(out).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/embed");
    expect(init.body).toContain('"model":"nomic-embed-text"');
    expect(init.body).toContain('"input":["um","dois"]');
  });

  it("lança erro quando a quantidade de vetores não bate com a entrada", async () => {
    const provider = new OllamaEmbeddingProvider({
      fetchFn: vi.fn().mockResolvedValue(embedResponse([[0.1, 0.2]])),
    });
    await expect(provider.embed(["a", "b"])).rejects.toMatchObject({
      code: "OLLAMA_EMBED_BAD_RESPONSE",
    });
  });

  it("lança erro claro quando o Ollama está indisponível", async () => {
    const provider = new OllamaEmbeddingProvider({
      fetchFn: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    });
    await expect(provider.embed(["a"])).rejects.toMatchObject({
      code: "OLLAMA_EMBED_UNAVAILABLE",
    });
  });

  it("lança erro em resposta HTTP não-ok", async () => {
    const provider = new OllamaEmbeddingProvider({
      fetchFn: vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    });
    await expect(provider.embed(["a"])).rejects.toMatchObject({
      code: "OLLAMA_EMBED_API_ERROR",
    });
  });
});
