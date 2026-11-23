import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { NewsItem } from "@/types";
import type { LlmOutput, LlmProvider } from "./llm-provider";
import type { BrandProfile } from "@/lib/settings-schema";

import { buildPrompt, parseLlmJson } from "./prompt";

export interface OllamaProviderOptions {
  /** Perfil da marca no prompt (DEC-027). Default: config/. */
  profile?: BrandProfile;
  baseUrl?: string;
  model?: string;
  /** Timeout por chamada em ms (default: 120 000 ms = 2 min). */
  timeoutMs?: number;
  /** Janela de contexto em tokens (default: 8192). Enxuto = cabe na VRAM. */
  numCtx?: number;
  /** Tempo que o modelo fica carregado entre chamadas (default: "10m"). */
  keepAlive?: string;
  /** Injetável para testes (default: global fetch). */
  fetchFn?: typeof fetch;
}

interface OllamaChatResponse {
  message?: { content?: string };
}

export class OllamaLlmProvider implements LlmProvider {
  readonly id = "ollama";

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly numCtx: number;
  private readonly keepAlive: string;
  private readonly fetchFn: typeof fetch;
  private readonly profile: BrandProfile | undefined;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    this.model = options.model ?? "qwen2.5:7b";
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.numCtx = options.numCtx ?? 8192;
    this.keepAlive = options.keepAlive ?? "10m";
    this.fetchFn = options.fetchFn ?? fetch;
    this.profile = options.profile;
  }

  async summarize(item: NewsItem): Promise<LlmOutput> {
    const text = await this.chat(buildPrompt(item, this.profile), 2200);
    logger.debug({ model: this.model, source: item.source }, "ollama response");
    return parseLlmJson(text, item.source);
  }

  /** Prompt livre → texto JSON (ajuste de um slide — UI-34). */
  async completeJson(prompt: string): Promise<string> {
    return this.chat(prompt, 700);
  }

  private async chat(prompt: string, numPredict: number): Promise<string> {
    const url = `${this.baseUrl}/api/chat`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: "json",
          keep_alive: this.keepAlive,
          options: {
            // Contexto enxuto → KV-cache cabe na VRAM (evita transbordo lento).
            num_ctx: this.numCtx,
            // Espaço suficiente para até 9 slides + caption longa + hashtags
            // (carrossel cresce com o conteúdo — ver content-target.ts).
            num_predict: numPredict,
            // temperature=0: respostas determinísticas, menos alucinação de fatos.
            temperature: 0,
          },
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new AppError(
          `Ollama excedeu o timeout de ${this.timeoutMs / 1000}s para o modelo "${this.model}". Considere um modelo menor (ex.: OLLAMA_MODEL=qwen2.5:3b) ou aumente OLLAMA_TIMEOUT_MS.`,
          504,
          "OLLAMA_TIMEOUT",
        );
      }
      const detail = err instanceof Error ? ` (${err.message})` : "";
      throw new AppError(
        `Ollama indisponível em ${this.baseUrl}${detail}. Verifique se o serviço está rodando (ollama serve).`,
        503,
        "OLLAMA_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AppError(
        `Ollama retornou erro HTTP ${res.status}: ${body.slice(0, 200)}`,
        res.status,
        "OLLAMA_API_ERROR",
      );
    }

    const json = (await res.json()) as OllamaChatResponse;
    return json.message?.content ?? "";
  }
}
