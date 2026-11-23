import Anthropic from "@anthropic-ai/sdk";

import type { NewsItem } from "@/types";
import type { LlmOutput, LlmProvider } from "./llm-provider";
import type { BrandProfile } from "@/lib/settings-schema";

import { buildPrompt, parseLlmJson } from "./prompt";

export class AnthropicLlmProvider implements LlmProvider {
  readonly id = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    apiKey: string,
    model = "claude-haiku-4-5-20251001",
    /** Perfil da marca no prompt (DEC-027). Default: config/. */
    private readonly profile?: BrandProfile,
  ) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async summarize(item: NewsItem): Promise<LlmOutput> {
    const msg = await this.client.messages.create({
      model: this.model,
      // Espaço suficiente para até 9 slides + caption longa + hashtags
      // (carrossel cresce com o conteúdo — ver content-target.ts).
      max_tokens: 1600,
      messages: [{ role: "user", content: buildPrompt(item, this.profile) }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    return parseLlmJson(text, item.source);
  }

  /** Prompt livre → texto JSON (ajuste de um slide — UI-34). */
  async completeJson(prompt: string): Promise<string> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0]?.type === "text" ? msg.content[0].text : "";
  }
}
