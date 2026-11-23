import { newsApiQueries } from "@config/sources";

import {
  SourcesEditor,
  type FeedHealth,
} from "@/components/settings/sources-editor";
import { formatDateTime } from "@/lib/format";
import { sourcesFailingConsecutively } from "@/services/pipeline/source-stats";
import { getEffectiveSettings } from "@/services/settings/settings-store";
import { listRecentRuns } from "@/services/storage/pipeline-run-store";

export const dynamic = "force-dynamic";

/** Fontes e palavras-chave editáveis (DEC-027) + saúde da última rodada (UI-31). */
export default async function FontesPage() {
  const [allRuns, settings] = await Promise.all([
    listRecentRuns(10),
    getEffectiveSettings(),
  ]);
  const runs = allRuns.filter(
    (r) => r.status !== "SKIPPED" && r.status !== "RUNNING",
  );
  const lastWithStats = runs.find((r) => r.sourceStats.length > 0);
  const failing = new Set(
    sourcesFailingConsecutively(runs.map((r) => r.sourceStats)),
  );

  const health: Record<string, FeedHealth> = {};
  for (const st of lastWithStats?.sourceStats ?? []) {
    health[st.source] = {
      collected: st.collected,
      selected: st.selected,
      fullArticle: st.fullArticle,
      drafts: st.drafts,
      status: failing.has(st.source)
        ? "failing"
        : st.feedFailed
          ? "failed"
          : st.selected > 0 && st.fullArticle === 0
            ? "summary"
            : "ok",
    };
  }

  return (
    <main className="px-5 pt-5 pb-10 md:px-10 md:pt-7 md:pb-12">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-5">
        <header className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] md:text-[26px]">
            Fontes
          </h1>
          <p className="m-0 max-w-[720px] text-sm leading-normal text-muted">
            De onde vêm as notícias e o que define o nicho das buscas. As
            mudanças valem a partir da próxima rodada da esteira.
          </p>
        </header>

        <SourcesEditor
          initialFeeds={settings.feeds}
          initialKeywords={settings.keywords}
          health={health}
          statsNote={
            lastWithStats
              ? `Números da rodada de ${formatDateTime(lastWithStats.startedAt)}. "Artigo completo" = selecionadas cujo texto integral foi lido.`
              : "Os números por fonte aparecem a partir da próxima rodada."
          }
          apiNote={
            newsApiQueries.length > 0
              ? `${newsApiQueries.length} buscas em API de notícias também ativas (config/sources.ts).`
              : null
          }
        />
      </div>
    </main>
  );
}
