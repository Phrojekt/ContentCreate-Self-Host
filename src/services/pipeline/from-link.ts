// Pipeline de item único: gerar rascunho a partir de um link (UI-33, DEC-026).
// Mesmas travas da esteira: lock, já-processados, gate de conteúdo, mesmo LLM
// (R0–R5 + crédito da fonte), rascunho PENDING (DEC-011). Dependências
// injetáveis para teste.

import { AppError } from "@/lib/errors";
import { isPublicHttpUrl, sourceNameFromUrl } from "@/lib/link-guard";
import { logger } from "@/lib/logger";
import { canonicalizeUrl } from "@/lib/url";
import type { ExtractedPage } from "@/services/enrichment/article-extractor";
import type { LlmOutput, LlmProvider } from "@/services/llm/llm-provider";
import { hasEnoughContent } from "@/services/processing/content-gate";
import type { NewsItem } from "@/types";

/** Teto do `summary` persistido — o texto integral nunca é guardado (DEC-008). */
const SUMMARY_MAX = 500;

export interface FromLinkDeps {
  llm: LlmProvider;
  extractPage: (url: string) => Promise<ExtractedPage | null>;
  lock: { acquire: () => Promise<boolean>; release: () => Promise<void> };
  isProcessed: (item: NewsItem) => Promise<boolean>;
  saveNewsItem: (item: NewsItem) => Promise<{ id: string }>;
  saveDraft: (input: {
    newsItemId: string;
    output: LlmOutput;
  }) => Promise<void>;
  markAsProcessed: (items: NewsItem[]) => Promise<void>;
  now?: () => Date;
}

export interface FromLinkResult {
  title: string;
  source: string;
  qualityScore: number | null;
}

export async function generateDraftFromLink(
  rawUrl: string,
  deps: FromLinkDeps,
): Promise<FromLinkResult> {
  const url = rawUrl.trim();
  if (!isPublicHttpUrl(url)) {
    throw new AppError(
      "Informe um link público começando com http:// ou https://.",
      400,
      "INVALID_LINK",
    );
  }

  if (!(await deps.lock.acquire())) {
    throw new AppError(
      "A esteira está rodando agora — tente de novo quando ela terminar.",
      409,
      "PIPELINE_BUSY",
    );
  }

  try {
    const probe: NewsItem = {
      title: url,
      summary: "",
      url,
      canonicalUrl: canonicalizeUrl(url),
      source: sourceNameFromUrl(url),
      publishedAt: (deps.now ?? (() => new Date()))(),
    };
    if (await deps.isProcessed(probe)) {
      throw new AppError(
        "Este link já virou rascunho antes (ou foi descartado pela esteira).",
        409,
        "LINK_ALREADY_PROCESSED",
      );
    }

    const page = await deps.extractPage(url);
    if (!page || !page.body) {
      throw new AppError(
        "Não consegui ler o texto desta página (bloqueio, paywall ou página sem artigo).",
        422,
        "LINK_UNREADABLE",
      );
    }

    const item: NewsItem = {
      ...probe,
      title: page.title ?? probe.source,
      summary: page.body.slice(0, SUMMARY_MAX),
      content: page.body,
      ...(page.imageUrl ? { imageUrl: page.imageUrl } : {}),
    };
    if (!hasEnoughContent(item)) {
      throw new AppError(
        "O texto da página é curto demais para um post confiável (anti-alucinação).",
        422,
        "LINK_THIN_CONTENT",
      );
    }

    const dbItem = await deps.saveNewsItem(item);
    const output = await deps.llm.summarize(item);
    await deps.saveDraft({ newsItemId: dbItem.id, output });
    await deps.markAsProcessed([item]);
    logger.info(
      { url, source: item.source },
      "Rascunho gerado a partir de link",
    );

    return {
      title: output.shortTitle,
      source: item.source,
      qualityScore: output.quality ? Math.round(output.quality.total) : null,
    };
  } finally {
    try {
      await deps.lock.release();
    } catch (err) {
      logger.error(
        { err },
        "Falha ao liberar a trava (gerar a partir de link)",
      );
    }
  }
}
