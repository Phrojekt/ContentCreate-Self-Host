import type { NewsItem, SlideContent } from "@/types";

/** Texto gerado pelo LLM para um post de Instagram. */
export interface LlmOutput {
  /** Título curto para o post (máx. ~10 palavras). */
  shortTitle: string;
  /** Legenda completa — reescrita com palavras próprias, credita a fonte (DEC-008). */
  caption: string;
  /** Hashtags sem o '#' (ex.: ["tecnologia", "ia"]). */
  hashtags: string[];
  /**
   * Slides de corpo do carrossel (gancho + parágrafo informativo, 1 por slide).
   * Opcional: quando vazio, o carrossel é montado dividindo a legenda. Cada item
   * é reescrito com palavras próprias (DEC-008).
   */
  slides?: SlideContent[];
  /**
   * Resultado do verificador de qualidade (UI-21) — preenchido só pelo
   * `AgenticRagProvider` com o MELHOR resultado (o que ele devolve).
   * Provedores "puros" (Anthropic/Ollama) não preenchem.
   */
  quality?: LlmQuality;
}

/** Nota + diagnóstico do verificador (`scoreOutput`), persistidos no rascunho. */
export interface LlmQuality {
  total: number;
  breakdown: Record<string, number>;
  violations: string[];
  /** Quantas tentativas o provider fez até chegar a este resultado. */
  attempts: number;
}

/** Fronteira do provedor de LLM (DEC-005). Trocar de modelo/provedor = nova classe. */
export interface LlmProvider {
  readonly id: string;
  summarize(item: NewsItem): Promise<LlmOutput>;
}
