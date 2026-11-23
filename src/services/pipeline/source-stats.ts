// Saúde por fonte numa rodada (UI-31). Função pura: recebe o que o pipeline
// já sabe (itens coletados, selecionados, enriquecidos, rascunhos, feeds que
// falharam) e devolve uma linha por fonte. Sem banco/rede/env.

export interface SourceStat {
  /** Nome da fonte (`NewsItem.source` / `RssFeedConfig.sourceName`). */
  source: string;
  /** Itens coletados desta fonte. */
  collected: number;
  /** Itens desta fonte que chegaram à seleção (top-N). */
  selected: number;
  /** Selecionados cujo artigo completo foi lido (extração OK). */
  fullArticle: number;
  /** Selecionados que ficaram só com o resumo do feed (bloqueio/timeout/curto). */
  summaryOnly: number;
  /** Rascunhos criados a partir desta fonte. */
  drafts: number;
  /** A coleta do feed falhou nesta rodada. */
  feedFailed: boolean;
}

export interface SourceStatsInput {
  /** Todas as fontes configuradas (aparecem mesmo com 0 itens). */
  configured: string[];
  collected: { source: string }[];
  selected: { source: string }[];
  /** Fontes dos selecionados que tiveram o artigo completo lido (1 por item). */
  fullArticleSources: string[];
  /** Fontes dos rascunhos criados (1 por rascunho). */
  draftSources: string[];
  failedFeeds: string[];
}

function countBy(list: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of list) m.set(s, (m.get(s) ?? 0) + 1);
  return m;
}

export function buildSourceStats(input: SourceStatsInput): SourceStat[] {
  const collected = countBy(input.collected.map((i) => i.source));
  const selected = countBy(input.selected.map((i) => i.source));
  const full = countBy(input.fullArticleSources);
  const drafts = countBy(input.draftSources);
  const failed = new Set(input.failedFeeds);
  const names = new Set([...input.configured, ...collected.keys(), ...failed]);
  return [...names]
    .map((source) => {
      const sel = selected.get(source) ?? 0;
      const fullArticle = Math.min(full.get(source) ?? 0, sel);
      return {
        source,
        collected: collected.get(source) ?? 0,
        selected: sel,
        fullArticle,
        summaryOnly: sel - fullArticle,
        drafts: drafts.get(source) ?? 0,
        feedFailed: failed.has(source),
      };
    })
    .sort(
      (a, b) => b.collected - a.collected || a.source.localeCompare(b.source),
    );
}

/**
 * Fontes que falharam na coleta em TODAS as `n` rodadas mais recentes
 * (alerta "Precisa da sua atenção" do Início). `runs` do mais novo ao mais
 * antigo; rodadas sem estatística não contam.
 */
export function sourcesFailingConsecutively(
  runs: SourceStat[][],
  n = 3,
): string[] {
  const recent = runs.filter((r) => r.length > 0).slice(0, n);
  if (recent.length < n) return [];
  const [first, ...rest] = recent;
  return first!
    .filter((s) => s.feedFailed)
    .map((s) => s.source)
    .filter((name) =>
      rest.every((run) => run.some((s) => s.source === name && s.feedFailed)),
    );
}
