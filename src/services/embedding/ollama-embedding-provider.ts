import { AppError } from "@/lib/errors";
import type { EmbeddingProvider } from "./embedding-provider";

export interface OllamaEmbeddingOptions {
  baseUrl?: string;
  model?: string;
  /** Timeout da chamada em ms (default: 60 000). */
  timeoutMs?: number;
  /** Injetável para testes (default: fetch global). */
  fetchFn?: typeof fetch;
}

interface OllamaEmbedResponse {
  embeddings?: number[][];
}

/**
 * Embeddings via Ollama (`/api/embed`, batch). Modelo default: nomic-embed-text
 * (768 dim), local e sem custo. Não usa chave de API.
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly id = "ollama-embed";

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: OllamaEmbeddingOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    this.model = options.model ?? "nomic-embed-text";
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ model: this.model, input: texts }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new AppError(
          `Ollama (embeddings) excedeu o timeout de ${this.timeoutMs / 1000}s.`,
          504,
          "OLLAMA_EMBED_TIMEOUT",
        );
      }
      throw new AppError(
        `Ollama (embeddings) indisponível em ${this.baseUrl}. Verifique se está rodando (ollama serve).`,
        503,
        "OLLAMA_EMBED_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new AppError(
        `Ollama (embeddings) retornou HTTP ${res.status}.`,
        res.status,
        "OLLAMA_EMBED_API_ERROR",
      );
    }

    const json = (await res.json()) as OllamaEmbedResponse;
    if (!json.embeddings || json.embeddings.length !== texts.length) {
      throw new AppError(
        "Ollama (embeddings) devolveu quantidade inesperada de vetores.",
        502,
        "OLLAMA_EMBED_BAD_RESPONSE",
      );
    }
    return json.embeddings;
  }
}
