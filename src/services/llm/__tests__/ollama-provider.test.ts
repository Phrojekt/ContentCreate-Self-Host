import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { OllamaLlmProvider } from "@/services/llm/ollama-provider";
import type { NewsItem } from "@/types";

function newsItem(over: Partial<NewsItem> = {}): NewsItem {
  return {
    title: "IA generativa acelera adoção no setor financeiro",
    summary:
      "Bancos e fintechs investem em modelos de linguagem para análise de dados.",
    url: "https://exemplo.com/ia-financeiro",
    canonicalUrl: "https://exemplo.com/ia-financeiro",
    source: "TechFinance",
    publishedAt: new Date("2026-06-18T08:00:00Z"),
    ...over,
  };
}

function ollamaResponse(content: string): Response {
  return new Response(
    JSON.stringify({ message: { role: "assistant", content } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("OllamaLlmProvider", () => {
  it("parseia resposta JSON válida corretamente", async () => {
    const payload = JSON.stringify({
      shortTitle: "IA no mercado financeiro",
      caption:
        "Instituições financeiras apostam em IA generativa. Fonte: TechFinance",
      hashtags: ["inteligenciaartificial", "fintech", "inovacao"],
    });

    const provider = new OllamaLlmProvider({
      fetchFn: vi.fn().mockResolvedValue(ollamaResponse(payload)),
    });

    const out = await provider.summarize(newsItem());

    expect(out.shortTitle).toBe("IA no mercado financeiro");
    expect(out.caption).toContain("Fonte: TechFinance");
    expect(out.hashtags).toEqual([
      "inteligenciaartificial",
      "fintech",
      "inovacao",
    ]);
  });

  it("usa URL e modelo configurados na requisição", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      ollamaResponse(
        JSON.stringify({
          shortTitle: "Título",
          caption: "Legenda. Fonte: X",
          hashtags: [],
        }),
      ),
    );

    const provider = new OllamaLlmProvider({
      baseUrl: "http://meu-servidor:11434",
      model: "qwen2.5:7b",
      fetchFn,
    });

    await provider.summarize(newsItem());

    expect(fetchFn).toHaveBeenCalledWith(
      "http://meu-servidor:11434/api/chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"model":"qwen2.5:7b"'),
      }),
    );
  });

  it("usa defaults (mistral + localhost) quando não configurado", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      ollamaResponse(
        JSON.stringify({
          shortTitle: "T",
          caption: "C. Fonte: X",
          hashtags: [],
        }),
      ),
    );

    const provider = new OllamaLlmProvider({ fetchFn });
    await provider.summarize(newsItem());

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(init.body).toContain('"model":"qwen2.5:7b"');
  });

  it("retorna fallback quando resposta não é JSON válido", async () => {
    const provider = new OllamaLlmProvider({
      fetchFn: vi.fn().mockResolvedValue(ollamaResponse("resposta inválida")),
    });

    const out = await provider.summarize(newsItem());

    expect(out.shortTitle).toBe("Notícia");
    expect(out.caption).toContain("TechFinance");
    expect(out.hashtags).toEqual([]);
  });

  it("lança AppError quando Ollama está indisponível (fetch throw)", async () => {
    const provider = new OllamaLlmProvider({
      fetchFn: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    });

    await expect(provider.summarize(newsItem())).rejects.toMatchObject({
      code: "OLLAMA_UNAVAILABLE",
    });
  });

  it("lança AppError em resposta HTTP de erro", async () => {
    const provider = new OllamaLlmProvider({
      fetchFn: vi
        .fn()
        .mockResolvedValue(new Response("model not found", { status: 404 })),
    });

    await expect(provider.summarize(newsItem())).rejects.toMatchObject({
      code: "OLLAMA_API_ERROR",
    });
  });

  it("inclui stream:false e format:json no payload", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      ollamaResponse(
        JSON.stringify({
          shortTitle: "T",
          caption: "C. Fonte: X",
          hashtags: [],
        }),
      ),
    );
    const provider = new OllamaLlmProvider({ fetchFn });
    await provider.summarize(newsItem());

    const body = JSON.parse(
      (fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body["stream"]).toBe(false);
    expect(body["format"]).toBe("json");
  });

  it("envia num_ctx e keep_alive para caber na VRAM e manter o modelo quente", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      ollamaResponse(
        JSON.stringify({
          shortTitle: "T",
          caption: "C. Fonte: X",
          hashtags: [],
        }),
      ),
    );
    const provider = new OllamaLlmProvider({
      fetchFn,
      numCtx: 4096,
      keepAlive: "30m",
    });
    await provider.summarize(newsItem());

    const body = JSON.parse(
      (fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body["keep_alive"]).toBe("30m");
    expect((body["options"] as Record<string, unknown>)["num_ctx"]).toBe(4096);
  });
});
