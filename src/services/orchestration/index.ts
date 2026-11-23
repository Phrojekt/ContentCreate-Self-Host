// Barrel + composition root do Bloco 5 (Orquestração).
import { projectConfig } from "@config/project.config";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  buildEmbeddingProvider,
  type EmbeddingProvider,
} from "@/services/embedding";
import {
  buildArticleExtractor,
  HttpArticleExtractor,
} from "@/services/enrichment";
import { AgenticRagProvider } from "@/services/llm/agentic-rag-provider";
import { AnthropicLlmProvider } from "@/services/llm/anthropic-provider";
import type { LlmProvider } from "@/services/llm/llm-provider";
import type { JsonCompleter } from "@/services/llm/slide-assist";
import {
  activeFeeds,
  brandProfileOf,
  type BrandProfile,
} from "@/lib/settings-schema";
import { getEffectiveSettings } from "@/services/settings/settings-store";
import type { CategoriesConfig } from "@/lib/categories";
import { OllamaLlmProvider } from "@/services/llm/ollama-provider";
import { syncManualEpisodic, syncManualMemory } from "@/services/memory";
import { generateDraftFromLink } from "@/services/pipeline/from-link";
import { runPipeline } from "@/services/pipeline/pipeline";
import { saveDraft } from "@/services/storage/draft-store";
import {
  filterAlreadyProcessed,
  markAsProcessed,
  saveNewsItem,
} from "@/services/storage/news-item-store";
import { outputDir, purgeExpiredRejected } from "@/services/publishing";
import {
  acquirePipelineLock,
  lockHolderId,
  releasePipelineLock,
} from "@/services/storage/pipeline-lock-store";
import type { Notifier } from "@/types";
import { NoopNotifier } from "./noop-notifier";
import { finishRun, startRun } from "@/services/storage/pipeline-run-store";
import {
  runOrchestratedPipeline,
  type OrchestrationOutcome,
  type RunTriggerKind,
} from "./orchestrator";
import { TelegramNotifier } from "./telegram-notifier";

export {
  runOrchestratedPipeline,
  formatRunReport,
  runStatusOf,
  shouldNotify,
} from "./orchestrator";
export type {
  OrchestrationOutcome,
  OrchestrateDeps,
  RunLog,
  RunTriggerKind,
} from "./orchestrator";
export { TelegramNotifier } from "./telegram-notifier";
export { NoopNotifier } from "./noop-notifier";
export { startScheduler } from "./scheduler";
export type { SchedulerDeps, ScheduleFn } from "./scheduler";

/** Notifier default: Telegram se configurado; senão só loga (NoopNotifier). */
export function buildNotifier(): Notifier {
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    return new TelegramNotifier(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
  }
  return new NoopNotifier();
}

/**
 * LLM default. Prioridade:
 * 1. LLM_API_KEY presente → Anthropic (Claude Haiku, pago por token).
 * 2. Caso contrário → Ollama local (sem custo; requer `ollama serve`).
 *    Modelo: OLLAMA_MODEL (default "qwen2.5:7b"). URL: OLLAMA_URL (default localhost:11434).
 *
 * `AgenticRagProvider` (DEC-017) envolve o provedor: recupera memória de
 * alinhamento (DEC-020) e reinterpreta/regenera quando a qualidade fica abaixo
 * do piso — substitui o antigo `QualityGatedProvider`. Sem `embedder`
 * (memória desligada ou Ollama de embeddings fora do ar), funciona só com o
 * feedback corretivo entre tentativas (fail-safe).
 */
function buildInnerProvider(
  profile?: BrandProfile,
): AnthropicLlmProvider | OllamaLlmProvider {
  return env.LLM_API_KEY
    ? new AnthropicLlmProvider(env.LLM_API_KEY, undefined, profile)
    : new OllamaLlmProvider({
        baseUrl: env.OLLAMA_URL,
        model: env.OLLAMA_MODEL,
        timeoutMs: env.OLLAMA_TIMEOUT_MS,
        numCtx: env.OLLAMA_NUM_CTX,
        keepAlive: env.OLLAMA_KEEP_ALIVE,
        ...(profile ? { profile } : {}),
      });
}

/** Completer de JSON para o ajuste de um slide (UI-34) — mesmo provedor da esteira. */
export function buildSlideCompleter(profile?: BrandProfile): JsonCompleter {
  return buildInnerProvider(profile);
}

/** LLM default da esteira: provedor puro (acima) dentro do AgenticRagProvider. */
export function buildLlm(
  embedder?: EmbeddingProvider,
  profile?: BrandProfile,
  categories?: CategoriesConfig,
): LlmProvider {
  const inner = buildInnerProvider(profile);
  return new AgenticRagProvider(inner, {
    ...(profile ? { handle: profile.handle } : {}),
    ...(categories ? { categories } : {}),
    ...(embedder ? { embedder } : {}),
    memoryTopK: projectConfig.memory.topK,
  });
}

/**
 * Roda a esteira UMA vez, orquestrada (timing + notificação). Entrada única
 * usada pela rota manual, pela CLI e pelo agendador.
 */
export async function runPipelineOnce(
  trigger: RunTriggerKind = "MANUAL",
): Promise<OrchestrationOutcome> {
  // Um único embedder serve a dedup semântica (Bloco 2) E a memória de
  // alinhamento (Bloco 2 — LLM); qualquer um dos dois habilitado já o constrói.
  const embedder =
    projectConfig.dedup.semantic.enabled || projectConfig.memory.enabled
      ? buildEmbeddingProvider()
      : undefined;

  if (embedder && projectConfig.memory.enabled) {
    try {
      await syncManualMemory(embedder);
    } catch (err) {
      logger.warn(
        { err },
        "Sync da memória procedural manual falhou (fail-safe)",
      );
    }
    try {
      await syncManualEpisodic(embedder);
    } catch (err) {
      logger.warn(
        { err },
        "Sync da memória episódica manual falhou (fail-safe)",
      );
    }
  }

  // Identidade, palavras-chave e feeds editáveis na UI (DEC-027).
  const settings = await getEffectiveSettings();
  const llm = buildLlm(
    projectConfig.memory.enabled ? embedder : undefined,
    brandProfileOf(settings),
    settings.categories,
  );
  const notifier = buildNotifier();
  const extractor = buildArticleExtractor();
  // Trava de concorrência: serializa rodadas (rota + CLI + agendador) para evitar
  // duplicação de rascunhos quando duas disparam ao mesmo tempo.
  const holder = lockHolderId();
  const outcome = await runOrchestratedPipeline({
    run: ({ runId }) =>
      runPipeline(llm, {
        embedder,
        extractor,
        feeds: activeFeeds(settings),
        keywords: settings.keywords,
        ...(runId ? { pipelineRunId: runId } : {}),
      }),
    trigger,
    runLog: { start: startRun, finish: finishRun },
    notifier,
    lock: {
      acquire: () => acquirePipelineLock(holder),
      release: () => releasePipelineLock(),
    },
  });

  // Expurgo dos descartados vencidos (UI-30) — best-effort, nunca derruba a rodada.
  if (!outcome.skipped) {
    try {
      await purgeExpiredRejected(
        new Date(),
        projectConfig.retention.rejectedDays,
        { outputDir: outputDir() },
      );
    } catch (err) {
      logger.warn({ err }, "Expurgo de descartados falhou (fail-safe)");
    }
  }
  return outcome;
}

/**
 * Gera um rascunho a partir de um link colado na UI (UI-33, DEC-026) com a
 * composição default (mesmo LLM/memória da esteira, mesmo lock).
 */
export async function generateFromLinkOnce(url: string) {
  const embedder = projectConfig.memory.enabled
    ? buildEmbeddingProvider()
    : undefined;
  const settings = await getEffectiveSettings();
  const llm = buildLlm(embedder, brandProfileOf(settings), settings.categories);
  const extractor = new HttpArticleExtractor();
  const holder = lockHolderId();
  return generateDraftFromLink(url, {
    llm,
    extractPage: (u) => extractor.extractPage(u),
    lock: {
      acquire: () => acquirePipelineLock(holder),
      release: () => releasePipelineLock(),
    },
    isProcessed: async (item) =>
      (await filterAlreadyProcessed([item])).length === 0,
    saveNewsItem,
    saveDraft,
    markAsProcessed,
  });
}
