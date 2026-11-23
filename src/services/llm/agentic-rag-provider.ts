import { AGENTIC_MAX_ATTEMPTS, QUALITY_MIN_SCORE } from "@/constants/quality";
import { projectConfig } from "@config/project.config";
import { logger } from "@/lib/logger";
import type { EmbeddingProvider } from "@/services/embedding";
import {
  recallMemory as defaultRecallMemory,
  type RecalledMemory,
} from "@/services/memory";
import { selectVariant } from "@/services/rendering/theme-selector";
import { classifyCategory, type CategoriesConfig } from "@/lib/categories";
import type { NewsItem } from "@/types";
import { computeContentTarget } from "./content-target";
import type { LlmOutput, LlmProvider } from "./llm-provider";
import { scoreOutput, type ScoreResult } from "./quality-scorer";

export interface AgenticRagDeps {
  /** Provider de embeddings p/ recall de memória. Ausente → segue sem memória (fail-safe). */
  embedder?: EmbeddingProvider;
  /** Injetável para testes; default: `recallMemory` real (Prisma). */
  recallMemory?: typeof defaultRecallMemory;
  /** Tentativas máximas por artigo (default: 3). */
  maxAttempts?: number;
  /** Pontuação mínima para aprovação (default: 90). */
  minScore?: number;
  /** Quantas entradas de memória recuperar na 1ª tentativa (default: 4; dobra a partir da 2ª). */
  memoryTopK?: number;
  /** @ exigido no CTA final pelo verificador (DEC-027). Default: config/. */
  handle?: string;
  /** Categorias configuradas (DEC-028) — recall episódico por categoria. */
  categories?: CategoriesConfig;
}

/** Um passo do loop — a "memória de curto prazo" da geração (DEC-017): existe só durante `summarize()`, nunca persistida. */
export interface AttemptTrace {
  attempt: number;
  score: number;
  passed: boolean;
  violations: string[];
  guidanceUsed: string[];
}

type Best = { output: LlmOutput; score: ScoreResult };

/**
 * Loop Agentic RAG (DEC-017): interpreta a notícia, seleciona contexto
 * (memória procedural/episódica recuperada por similaridade — DEC-020; as
 * fontes correlatas de cross-checagem já vêm anexadas pelo Bloco 2 — DEC-019),
 * gera, verifica (`scoreOutput`) e, se a relevância ainda for baixa,
 * reinterpreta — amplia o recall de memória e injeta o feedback corretivo da
 * tentativa anterior — antes de regenerar.
 *
 * Substitui `QualityGatedProvider` na composição default (mesma degradação
 * graciosa: nunca lança, devolve o melhor resultado obtido ao esgotar as
 * tentativas). Sem `embedder` configurado, funciona só com o feedback
 * corretivo entre tentativas (fail-safe — memória é sempre opcional).
 */
/** Anexa a nota do verificador ao resultado devolvido (UI-21). */
function withQuality(
  output: LlmOutput,
  score: ScoreResult,
  attempts: number,
): LlmOutput {
  return {
    ...output,
    quality: {
      total: score.total,
      breakdown: { ...score.breakdown },
      violations: [...score.violations],
      attempts,
    },
  };
}

export class AgenticRagProvider implements LlmProvider {
  readonly id: string;
  private readonly embedder: EmbeddingProvider | undefined;
  private readonly recallMemory: typeof defaultRecallMemory;
  private readonly maxAttempts: number;
  private readonly minScore: number;
  private readonly memoryTopK: number;
  private readonly handle: string;
  private readonly categories: CategoriesConfig | undefined;

  constructor(
    private readonly inner: LlmProvider,
    deps: AgenticRagDeps = {},
  ) {
    this.id = `agentic-rag(${inner.id})`;
    this.embedder = deps.embedder;
    this.recallMemory = deps.recallMemory ?? defaultRecallMemory;
    this.maxAttempts = deps.maxAttempts ?? AGENTIC_MAX_ATTEMPTS;
    this.minScore = deps.minScore ?? QUALITY_MIN_SCORE;
    this.memoryTopK = deps.memoryTopK ?? 4;
    this.handle = deps.handle ?? projectConfig.social.instagramHandle;
    this.categories = deps.categories;
  }

  async summarize(item: NewsItem): Promise<LlmOutput> {
    const sourceText = item.content ?? item.summary;
    const target = computeContentTarget(sourceText.length);
    const handle = this.handle;
    const queryText = `${item.title}\n${sourceText.slice(0, 500)}`;

    const trace: AttemptTrace[] = [];
    let best: Best | null = null;
    // Categoria só é conhecida DEPOIS de uma 1ª geração (deriva de shortTitle+caption) —
    // por isso a memória episódica (few-shot por categoria) só entra a partir da 2ª tentativa.
    let category: string | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const guidance = await this.selectGuidance(
        queryText,
        category,
        attempt,
        best,
      );

      const enrichedItem: NewsItem = guidance.length
        ? { ...item, learnedGuidance: guidance }
        : item;
      const output = await this.inner.summarize(enrichedItem);
      const score = scoreOutput(output, target, handle, sourceText);

      trace.push({
        attempt,
        score: score.total,
        passed: score.passed,
        violations: score.violations,
        guidanceUsed: guidance,
      });
      logger.info(
        {
          provider: this.inner.id,
          attempt,
          maxAttempts: this.maxAttempts,
          score: score.total,
          passed: score.passed,
          memoryEntries: guidance.length,
          ...(score.violations.length > 0 && { violations: score.violations }),
        },
        `Agentic RAG: tentativa ${attempt}/${this.maxAttempts} — ${score.total}/100${score.passed ? " ✓" : " ✗"}`,
      );

      if (!best || score.total > best.score.total) best = { output, score };
      category = this.categories
        ? classifyCategory(output.shortTitle, output.caption, this.categories)
        : selectVariant(output.shortTitle, output.caption);

      if (score.passed) return withQuality(output, score, attempt);

      if (attempt < this.maxAttempts) {
        logger.warn(
          { score: score.total, violations: score.violations },
          `Agentic RAG: reinterpretando e regenerando (${score.total} < ${this.minScore})`,
        );
      }
    }

    logger.error(
      {
        bestScore: best!.score.total,
        violations: best!.score.violations,
        maxAttempts: this.maxAttempts,
        trace,
      },
      `Agentic RAG: esgotadas ${this.maxAttempts} tentativas — usando melhor resultado (${best!.score.total}/100)`,
    );
    return withQuality(best!.output, best!.score, this.maxAttempts);
  }

  /**
   * Interpretar/selecionar (Source Selector — DEC-020): memória procedural
   * genérica sempre que houver embedder; a partir da 2ª tentativa, amplia o
   * recall e soma memória episódica (few-shot) da categoria observada na
   * tentativa anterior, mais o feedback corretivo dos `violations`.
   */
  private async selectGuidance(
    queryText: string,
    category: string | undefined,
    attempt: number,
    best: Best | null,
  ): Promise<string[]> {
    if (!this.embedder) return this.correctiveFeedback(best);

    const topK = attempt === 1 ? this.memoryTopK : this.memoryTopK * 2;
    try {
      const [procedural, episodic] = await Promise.all([
        this.recallMemory(this.embedder, queryText, {
          kind: "PROCEDURAL",
          ...(category ? { category } : {}),
          topK,
        }),
        attempt > 1 && category
          ? this.recallMemory(this.embedder, queryText, {
              kind: "EPISODIC",
              category,
              topK: 2,
            })
          : Promise.resolve<RecalledMemory[]>([]),
      ]);

      return [
        ...procedural.map((m) => m.content),
        ...episodic.map((m) => `Exemplo do que funcionou antes: ${m.content}`),
        ...this.correctiveFeedback(best),
      ];
    } catch (err) {
      logger.warn(
        { err },
        "Agentic RAG: recall de memória falhou — seguindo só com feedback corretivo (fail-safe)",
      );
      return this.correctiveFeedback(best);
    }
  }

  /** Transforma os `violations` da melhor tentativa até agora em instrução corretiva explícita. */
  private correctiveFeedback(best: Best | null): string[] {
    if (!best || best.score.violations.length === 0) return [];
    return [
      `A tentativa anterior foi reprovada por: ${best.score.violations.join("; ")}. Corrija especificamente isso nesta nova tentativa.`,
    ];
  }
}
