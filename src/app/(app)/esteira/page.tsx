import { projectConfig } from "@config/project.config";
import { newsApiQueries } from "@config/sources";

import { RunPipelineButton } from "@/components/home/run-button";
import { DEFAULT_CRON } from "@/constants/orchestration";
import { AGENTIC_MAX_ATTEMPTS, QUALITY_MIN_SCORE } from "@/constants/quality";
import { env } from "@/lib/env";
import { formatDateTime, formatUsd } from "@/lib/format";
import { cronToPhrase, dropReasons } from "@/lib/run-insights";
import { getEffectiveSettings } from "@/services/settings/settings-store";
import { listRecentRuns } from "@/services/storage/pipeline-run-store";

export const dynamic = "force-dynamic";

const card = "rounded-2xl border border-line bg-surface p-5 md:p-6";

const STATUS = {
  RUNNING: ["Rodando", "bg-accent-soft text-accent-ink"],
  OK: ["OK", "bg-approve-soft text-approve-ink"],
  PARTIAL: ["Com erros", "bg-warn-bg text-warn-ink"],
  FAILED: ["Falhou", "bg-discard-soft text-discard"],
  SKIPPED: ["Pulada", "bg-line-soft text-muted"],
} as const;

const HEADERS = [
  "Início",
  "Origem",
  "Status",
  "Coletadas",
  "Após filtro",
  "Selecionadas",
  "Rascunhos",
  "Custo",
  "Duração",
];

export default async function EsteiraPage() {
  const [runs, settings] = await Promise.all([
    listRecentRuns(20),
    getEffectiveSettings(),
  ]);
  const feedsOn = settings.feeds.filter((f) => f.enabled).length;
  const kw = settings.keywords;
  const last = runs.find(
    (r) => r.status !== "SKIPPED" && r.status !== "RUNNING",
  );
  const cron = env.PIPELINE_CRON ?? DEFAULT_CRON;
  const cronPhrase = cronToPhrase(cron);
  // Só o booleano sai do servidor — o token nunca vai ao cliente.
  const telegram = Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
  const drops = last ? dropReasons(last) : null;
  const { selection, dedup, memory } = projectConfig;

  const steps = [
    {
      title: "Coleta",
      text: `Lê ${feedsOn} feeds RSS${newsApiQueries.length ? ` e ${newsApiQueries.length} buscas de API` : ""} e guarda só notícias das últimas ${selection.recencyHours} horas.`,
    },
    {
      title: "Duplicadas e tema",
      text: `Junta títulos parecidos (similaridade ≥ ${dedup.titleSimilarityThreshold})${dedup.semantic.enabled ? ` e a mesma história em feeds diferentes (sentido ≥ ${dedup.semantic.threshold})` : ""}. Exige uma de ${kw.required.length} palavras-chave do tema e descarta ${kw.blocked.length} termos bloqueados.`,
    },
    {
      title: "Seleção",
      text: `Pula o que já virou post em rodadas anteriores e escolhe até ${selection.topN} notícias por rodada. Texto curto demais fica de fora (anti-alucinação).`,
    },
    {
      title: "Geração e verificação",
      text: `Escreve o carrossel em português, creditando a fonte, e confere idioma, originalidade e estrutura. Abaixo da nota ${QUALITY_MIN_SCORE}, reescreve — até ${AGENTIC_MAX_ATTEMPTS} tentativas${memory.enabled ? `, com até ${memory.topK} lições da Memória` : ""}.`,
    },
    {
      title: "Sua revisão",
      text: "Tudo vira rascunho. Nada vai para o Instagram sem a sua aprovação.",
    },
  ];

  return (
    <main className="px-5 pt-5 pb-10 md:px-10 md:pt-7 md:pb-12">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] md:text-[26px]">
              Esteira
            </h1>
            <p className="m-0 max-w-[640px] text-sm leading-normal text-muted">
              Como as notícias viram rascunhos. Fontes e tema se editam em
              Fontes; para mudar o horário, edite{" "}
              <code className="font-mono text-[13px]">config/</code> e o{" "}
              <code className="font-mono text-[13px]">.env</code>.
            </p>
          </div>
          <RunPipelineButton running={runs[0]?.status === "RUNNING"} />
        </header>

        <section aria-label="Etapas" className={card}>
          <h2 className="m-0 mb-4 text-base font-semibold">Etapas</h2>
          <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-5">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-3.5"
              >
                <span className="font-mono text-xs text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold">{s.title}</span>
                <span className="text-[13px] leading-normal text-ink-2">
                  {s.text}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <section aria-label="Quando roda" className={card}>
            <h2 className="m-0 mb-3 text-base font-semibold">Quando roda</h2>
            <p className="m-0 text-[15px] font-medium">
              {cronPhrase ?? "Agenda personalizada"}
            </p>
            <p className="m-0 mt-1 text-[13px] leading-normal text-muted">
              <code className="font-mono">{cron}</code> · definido em{" "}
              <code className="font-mono">PIPELINE_CRON</code>
              {env.PIPELINE_CRON ? "" : " (padrão)"}. O agendador é um processo
              separado (
              <code className="font-mono">npm run scheduler:start</code>).
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${telegram ? "bg-approve" : "bg-line-field"}`}
              />
              Avisos no Telegram:{" "}
              <strong className="font-semibold">
                {telegram ? "Conectado" : "Não configurado"}
              </strong>
            </div>
          </section>

          <section aria-label="Por que ficaram de fora" className={card}>
            <h2 className="m-0 mb-3 text-base font-semibold">
              {drops
                ? `Por que ${drops.total} ficaram de fora na última rodada`
                : "Por que ficaram de fora"}
            </h2>
            {!drops ? (
              <p className="m-0 text-sm text-muted">
                Nenhuma rodada concluída ainda.
              </p>
            ) : drops.reasons.length === 0 ? (
              <p className="m-0 text-sm text-muted">
                Tudo que foi coletado virou rascunho.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {drops.reasons.map((r) => (
                  <li
                    key={r.label}
                    className="flex items-center gap-3 text-[13px]"
                  >
                    <span className="w-10 text-right font-mono font-semibold">
                      {r.count}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-1.5 flex-none rounded-full bg-accent/60"
                      style={{
                        width: `${Math.max(4, (r.count / drops.total) * 120)}px`,
                      }}
                    />
                    <span className="text-ink-2">{r.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section
          aria-label="Rodadas recentes"
          className="overflow-hidden rounded-2xl border border-line bg-surface"
        >
          <h2 className="m-0 border-b border-line-soft px-5 py-4 text-base font-semibold">
            Rodadas recentes
          </h2>
          {runs.length === 0 ? (
            <p className="m-0 px-5 py-6 text-sm text-muted">
              Nenhuma rodada registrada. O histórico começa na próxima rodada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-surface-2 text-left text-xs text-muted">
                    {HEADERS.map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-4 py-2.5 font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t border-line-soft">
                      <td className="px-4 py-2.5">
                        {formatDateTime(r.startedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-ink-2">
                        {r.trigger === "SCHEDULED" ? "Agendada" : "Manual"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS[r.status][1]}`}
                          title={
                            r.failure ??
                            (r.errors.length ? r.errors.join("\n") : undefined)
                          }
                        >
                          {STATUS[r.status][0]}
                          {r.errors.length > 0 && ` · ${r.errors.length}`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono">{r.collected}</td>
                      <td className="px-4 py-2.5 font-mono">{r.afterFilter}</td>
                      <td className="px-4 py-2.5 font-mono">{r.selected}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold">
                        {r.draftsCreated}
                      </td>
                      <td className="px-4 py-2.5 font-mono">
                        {formatUsd(r.estimatedCostUsd)}
                      </td>
                      <td className="px-4 py-2.5 font-mono">
                        {r.durationMs === null
                          ? "—"
                          : `${Math.round(r.durationMs / 1000)} s`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
