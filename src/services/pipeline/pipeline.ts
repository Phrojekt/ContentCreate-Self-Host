import { keywords, type KeywordsConfig } from "@config/keywords";
import { rssFeeds } from "@config/sources";
import { projectConfig } from "@config/project.config";
import { logger } from "@/lib/logger";
import { collect } from "@/services/collection";
import { embedNewsItems, type EmbeddingProvider } from "@/services/embedding";
import {
  enrichWithArticle,
  type ArticleExtractor,
} from "@/services/enrichment";
import {
  estimatePostCost,
  PROMPT_OVERHEAD_CHARS,
  sumCosts,
  type CostBreakdown,
} from "@/services/cost/cost-estimator";
import type { LlmOutput, LlmProvider } from "@/services/llm/llm-provider";
import {
  contentLength,
  hasEnoughContent,
} from "@/services/processing/content-gate";
import { deduplicate } from "@/services/processing/dedup";
import { clusterByEmbedding } from "@/services/processing/semantic-dedup";
import { filterByKeywords } from "@/services/processing/filter";
import { selectTopN } from "@/services/processing/selector";
import { saveDraft } from "@/services/storage/draft-store";
import {
  filterAlreadyProcessed,
  markAsProcessed,
  saveNewsItem,
} from "@/services/storage/news-item-store";
import type { NewsItem, RssFeedConfig } from "@/types";
import { buildSourceStats, type SourceStat } from "./source-stats";

export interface PipelineResult {
  collected: number;
  afterDedup: number;
  afterFilter: number;
  afterAlreadyProcessed: number;
  afterSemantic: number;
  selected: number;
  /** Itens descartados por conteúdo insuficiente (gate anti-alucinação). */
  skippedThinContent: number;
  draftsCreated: number;
  /** Custo estimado da rodada em USD (tokens do LLM + render). ~0 com Ollama. */
  estimatedCostUsd: number;
  errors: string[];
  /** Saúde por fonte nesta rodada (UI-31). */
  sourceStats?: SourceStat[];
}

export interface PipelineDeps {
  /** Provider de embeddings p/ dedup semântica. Ausente → etapa pulada. */
  embedder?: EmbeddingProvider;
  /** Extrator de artigo p/ ler o texto integral. Ausente → usa só o resumo. */
  extractor?: ArticleExtractor;
  /** Rodada registrada (UI-20) — liga os rascunhos criados a ela. */
  pipelineRunId?: string;
  /** Feeds ativos (DEC-027 — editáveis na UI). Default: config/sources.ts. */
  feeds?: RssFeedConfig[];
  /** Palavras-chave (DEC-027). Default: config/keywords.ts. */
  keywords?: KeywordsConfig;
}

/**
 * Pipeline completo: coleta → dedup → filtro → já-processados → dedup semântica
 * → seleção → resumo via LLM → persistência de rascunhos.
 *
 * Nada é publicado (DEC-011 — humano no loop). `LlmProvider` e `EmbeddingProvider`
 * são injetáveis para permitir testes sem chamadas reais à rede.
 */
export async function runPipeline(
  llm: LlmProvider,
  deps: PipelineDeps = {},
): Promise<PipelineResult> {
  const errors: string[] = [];

  // 1. Coleta (registra feeds que falharam — saúde por fonte, UI-31)
  const failedFeeds: string[] = [];
  const feeds = deps.feeds ?? rssFeeds;
  const { items: collected, errors: collectErrors } = await collect({
    onFeedFailed: (name) => failedFeeds.push(name),
    feeds,
  });
  const configuredSources = feeds.map((f) => f.sourceName);
  const fullArticleSources: string[] = [];
  const draftSources: string[] = [];
  for (const { sourceId, error } of collectErrors) {
    errors.push(
      `Fonte ${sourceId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  logger.info({ count: collected.length }, "Coleta concluída");

  // 2. Deduplicação (URL canônica + similaridade de título)
  const afterDedup = deduplicate(
    collected,
    projectConfig.dedup.titleSimilarityThreshold,
  );
  logger.info(
    { before: collected.length, after: afterDedup.length },
    "Deduplicação",
  );

  // 3. Filtro de relevância por palavras-chave
  const afterFilter = filterByKeywords(afterDedup, deps.keywords ?? keywords);
  logger.info(
    { before: afterDedup.length, after: afterFilter.length },
    "Filtro de relevância",
  );

  // 4. Filtro de já-processados (persistência entre rodadas)
  const afterAlreadyProcessed = await filterAlreadyProcessed(afterFilter);
  logger.info(
    { before: afterFilter.length, after: afterAlreadyProcessed.length },
    "Filtro de já-processados",
  );

  // 5. Dedup semântica por embeddings (mesma notícia de feeds diferentes).
  // Config-gated e fail-safe: se o provider falhar, segue sem dedup semântica.
  const afterSemantic = await semanticDedup(afterAlreadyProcessed, deps);

  // 6. Seleção top-N por recência
  const selected = selectTopN(
    afterSemantic,
    projectConfig.selection.topN,
    projectConfig.selection.recencyHours,
  );
  logger.info({ count: selected.length }, "Selecionados para resumo");

  if (selected.length === 0) {
    logger.info("Nenhum item novo para processar nesta rodada.");
    return {
      sourceStats: buildSourceStats({
        configured: configuredSources,
        collected,
        selected,
        fullArticleSources,
        draftSources,
        failedFeeds,
      }),
      collected: collected.length,
      afterDedup: afterDedup.length,
      afterFilter: afterFilter.length,
      afterAlreadyProcessed: afterAlreadyProcessed.length,
      afterSemantic: afterSemantic.length,
      selected: 0,
      skippedThinContent: 0,
      draftsCreated: 0,
      estimatedCostUsd: 0,
      errors,
    };
  }

  // 7. Enriquece, aplica o gate de conteúdo, gera resumos LLM + persiste rascunhos.
  // `processedItems` reúne sucessos E descartes: ambos são decisões terminais para
  // a URL — marcá-los evita re-buscar/re-extrair o mesmo artigo magro a cada rodada.
  const processedItems: NewsItem[] = [];
  const costs: CostBreakdown[] = [];
  let draftsCreated = 0;
  let skippedThinContent = 0;

  for (const [i, item] of selected.entries()) {
    try {
      const dbItem = await saveNewsItem(item);
      // Lê o artigo integral (só dos selecionados) p/ um resumo melhor.
      const enriched = deps.extractor
        ? await enrichWithArticle(deps.extractor, item)
        : item;
      if (enriched.content) fullArticleSources.push(item.source);

      // Gate anti-alucinação: texto magro mesmo após enriquecimento → descarta.
      if (!hasEnoughContent(enriched)) {
        skippedThinContent++;
        processedItems.push(item);
        logger.info(
          {
            index: i + 1,
            total: selected.length,
            title: item.title,
            len: contentLength(enriched),
          },
          "Item descartado: conteúdo insuficiente para gerar fatos confiáveis",
        );
        continue;
      }

      logger.info(
        {
          index: i + 1,
          total: selected.length,
          title: item.title,
          provider: llm.id,
        },
        "LLM: iniciando resumo",
      );
      const llmOutput = await llm.summarize(enriched);
      await saveDraft({
        newsItemId: dbItem.id,
        output: llmOutput,
        ...(deps.pipelineRunId ? { pipelineRunId: deps.pipelineRunId } : {}),
      });
      processedItems.push(item);
      draftsCreated++;
      draftSources.push(item.source);
      // Custo estimado deste post (tokens ~ tamanho do texto; ver cost-estimator).
      costs.push(
        estimatePostCost(
          {
            provider: llm.id,
            inputChars: contentLength(enriched) + PROMPT_OVERHEAD_CHARS,
            outputChars: llmOutputChars(llmOutput),
            images: (llmOutput.slides?.length ?? 0) + 1, // capa + slides de corpo
          },
          projectConfig.costs,
        ),
      );
      logger.info(
        { index: i + 1, total: selected.length, title: item.title },
        "Rascunho criado",
      );
    } catch (err) {
      const msg = `"${item.title}": ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.error({ title: item.title, err }, "Erro ao processar item");
    }
  }

  // 8. Marca como processados os que geraram rascunho E os descartados por conteúdo.
  // Itens que falharam por erro (catch) NÃO entram — podem ser reprocessados.
  await markAsProcessed(processedItems);

  const estimatedCostUsd = sumCosts(costs).totalUsd;
  logger.info(
    {
      draftsCreated,
      skippedThinContent,
      estimatedCostUsd,
      errors: errors.length,
    },
    "Pipeline concluído",
  );

  return {
    collected: collected.length,
    afterDedup: afterDedup.length,
    afterFilter: afterFilter.length,
    afterAlreadyProcessed: afterAlreadyProcessed.length,
    afterSemantic: afterSemantic.length,
    selected: selected.length,
    skippedThinContent,
    draftsCreated,
    estimatedCostUsd,
    errors,
    sourceStats: buildSourceStats({
      configured: configuredSources,
      collected,
      selected,
      fullArticleSources,
      draftSources,
      failedFeeds,
    }),
  };
}

/** Soma os caracteres de todos os campos de texto gerados pelo LLM. */
function llmOutputChars(out: LlmOutput): number {
  const slides = out.slides?.map((s) => `${s.lead} ${s.body}`).join(" ") ?? "";
  const tags = out.hashtags.join(" ");
  return (
    out.shortTitle.length + out.caption.length + slides.length + tags.length
  );
}

/** No máximo N fontes-irmãs anexadas por item — mantém o prompt sob controle. */
const MAX_CORROBORATING_SOURCES = 3;
/** Teto de caracteres do resumo de cada fonte-irmã anexada. */
const CORROBORATING_SUMMARY_MAX_CHARS = 500;

/**
 * Reduz um grupo de itens quase-duplicados (mesma notícia, fontes diferentes)
 * a um representante, anexando os demais como `corroboratingSources` (DEC-019)
 * em vez de descartá-los — vira insumo de cross-checagem para o LLM.
 */
function representWithCorroboration(members: NewsItem[]): NewsItem {
  const [representative, ...siblings] = members;
  if (!representative) throw new Error("Grupo de dedup semântica vazio.");
  if (siblings.length === 0) return representative;

  const corroboratingSources = siblings
    .slice(0, MAX_CORROBORATING_SOURCES)
    .map((s) => ({
      source: s.source,
      title: s.title,
      text: s.summary.slice(0, CORROBORATING_SUMMARY_MAX_CHARS),
    }));

  return { ...representative, corroboratingSources };
}

/**
 * Dedup semântica fail-safe: embeda os itens e agrupa os semanticamente
 * próximos (mesma notícia, fontes diferentes), retendo as fontes-irmãs como
 * corroboração em vez de descartá-las (DEC-019). Desligada na config, sem
 * provider, ou com ≤1 item → retorna a lista intacta. Qualquer erro do
 * provider é logado e a etapa é pulada (não derruba a rodada — DEC-006/robustez).
 */
async function semanticDedup(
  items: NewsItem[],
  deps: PipelineDeps,
): Promise<NewsItem[]> {
  const { enabled, threshold } = projectConfig.dedup.semantic;
  if (!enabled || !deps.embedder || items.length <= 1) return items;

  try {
    const vectors = await embedNewsItems(deps.embedder, items);
    const clusters = clusterByEmbedding(items, vectors, threshold);
    const deduped = clusters.map(representWithCorroboration);
    logger.info(
      { before: items.length, after: deduped.length },
      "Dedup semântica",
    );
    return deduped;
  } catch (err) {
    logger.warn({ err }, "Dedup semântica falhou — pulando (fail-safe)");
    return items;
  }
}
