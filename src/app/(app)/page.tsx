import { projectConfig } from "@config/project.config";
import Link from "next/link";

import { FromLinkButton } from "@/components/home/from-link-button";
import { RunPipelineButton } from "@/components/home/run-button";
import { IconChevronRight } from "@/components/ui/icons";
import { QUALITY_MIN_SCORE } from "@/constants/quality";
import { formatAge, formatUsd } from "@/lib/format";
import { daysUntilPurge } from "@/lib/retention";
import { buildBriefing, runFunnel } from "@/lib/run-insights";
import { listMemoryEntries } from "@/services/memory";
import {
  countDecisionsSince,
  listReviewQueue,
} from "@/services/storage/draft-store";
import { sourcesFailingConsecutively } from "@/services/pipeline/source-stats";
import {
  getLastRun,
  listRecentRuns,
} from "@/services/storage/pipeline-run-store";

export const dynamic = "force-dynamic";

const STATUS_LABEL = {
  RUNNING: ["Em andamento", "bg-accent"],
  OK: ["Concluída", "bg-approve"],
  PARTIAL: ["Concluída com erros", "bg-warn-dot"],
  FAILED: ["Falhou", "bg-discard"],
  SKIPPED: ["Pulada", "bg-muted"],
} as const;

const card = "rounded-2xl border border-line bg-surface p-5 md:p-6";

function duration(ms: number | null): string {
  if (ms === null) return "";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** Resumo curto de uma lição para o cartão "O que aprendi". */
function lessonLine(content: string): string {
  const motive = /Motivo do descarte: ([^\n]+)/.exec(content)?.[1];
  const title = /shortTitle: "([^"]+)"/.exec(content)?.[1];
  if (motive)
    return `${motive.replace(/\.$/, "")}${title ? ` — “${title}”` : ""}`;
  return title ? `“${title}”` : content.slice(0, 90);
}

export default async function InicioPage() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [lastRun, pending, rejected, week, lessons, recentRuns] =
    await Promise.all([
      getLastRun(),
      listReviewQueue({ statuses: ["PENDING"] }),
      listReviewQueue({ statuses: ["REJECTED"] }),
      countDecisionsSince(weekAgo),
      listMemoryEntries({ feedbackOnly: true, since: weekAgo, limit: 5 }).catch(
        () => [],
      ),
      listRecentRuns(6),
    ]);
  const failingSources = sourcesFailingConsecutively(
    recentRuns
      .filter((r) => r.status !== "SKIPPED" && r.status !== "RUNNING")
      .map((r) => r.sourceStats),
  );

  const lowScore = pending.filter(
    (d) => d.qualityScore !== null && d.qualityScore < QUALITY_MIN_SCORE,
  );
  const expiring = rejected.filter(
    (d) =>
      daysUntilPurge(
        d.rejectedAt ?? d.updatedAt,
        now,
        projectConfig.retention.rejectedDays,
      ) <= 5,
  );
  const briefing = buildBriefing(
    lastRun,
    pending.length,
    lowScore.length,
    now,
    pending.filter((d) => d.qualityScore !== null).length,
  );
  const decided = week.approved + week.rejected;
  const rate = decided > 0 ? Math.round((week.approved / decided) * 100) : null;
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(now)
    .toUpperCase();

  return (
    <main className="px-5 pt-5 pb-10 md:px-10 md:pt-7 md:pb-12">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xs tracking-[0.06em] text-muted">
              {dateLabel}
            </span>
            <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] md:text-[26px]">
              {briefing.headline}
            </h1>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <FromLinkButton />
            <RunPipelineButton running={lastRun?.status === "RUNNING"} />
          </div>
        </header>

        <section
          aria-label="Briefing"
          className="flex flex-col gap-4 rounded-2xl border border-[#D9DAF5] bg-accent-soft p-5 md:p-6"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-accent-ink">
              Resumo
              {lastRun
                ? ` · rodada de ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(lastRun.startedAt)}`
                : ""}
            </span>
            <p className="m-0 max-w-[820px] text-[15px] leading-[1.6] text-ink">
              {briefing.body}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {pending.length > 0 && (
              <Link
                href="/revisao"
                className="flex h-10 items-center gap-1.5 rounded-[10px] bg-accent px-3.5 text-sm font-semibold text-white no-underline"
              >
                Começar a revisão <IconChevronRight size={15} />
              </Link>
            )}
            {lowScore.length > 0 && (
              <Link
                href="/revisao?tab=nota-baixa"
                className="flex h-10 items-center rounded-[10px] border border-line-field bg-surface px-3.5 text-sm font-medium text-ink no-underline"
              >
                Mostrar só os de nota baixa
              </Link>
            )}
            {lastRun && lastRun.collected > lastRun.draftsCreated && (
              <Link
                href="/esteira"
                className="flex h-10 items-center px-2 text-sm font-medium"
              >
                Por que {lastRun.collected - lastRun.draftsCreated} ficaram de
                fora?
              </Link>
            )}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <section aria-label="Última rodada da esteira" className={card}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-base font-semibold">Última rodada</h2>
                {lastRun && (
                  <span className="flex items-center gap-2 text-[13px] text-muted">
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full ${STATUS_LABEL[lastRun.status][1]}`}
                    />
                    {STATUS_LABEL[lastRun.status][0]}
                    {lastRun.durationMs !== null &&
                      ` · ${duration(lastRun.durationMs)}`}{" "}
                    · {formatUsd(lastRun.estimatedCostUsd)}
                  </span>
                )}
              </div>
              {lastRun ? (
                <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-5">
                  {[
                    ...runFunnel(lastRun),
                    {
                      label: "Sua revisão",
                      value: pending.length,
                      note: "pendentes agora",
                    },
                  ].map((s) => (
                    <li
                      key={s.label}
                      className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3"
                    >
                      <span className="text-xs font-medium text-muted">
                        {s.label}
                      </span>
                      <span className="font-mono text-[22px] font-semibold">
                        {s.value}
                      </span>
                      <span className="text-[11px] leading-snug text-muted">
                        {s.note}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 text-sm text-muted">
                  Nenhuma rodada registrada ainda.
                </p>
              )}
            </section>

            <section aria-label="Primeiros da fila" className={card}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="m-0 text-base font-semibold">
                  Primeiros da fila
                </h2>
                {pending.length > 3 && (
                  <Link href="/revisao" className="text-[13px] font-medium">
                    Ver todos ({pending.length})
                  </Link>
                )}
              </div>
              {pending.length === 0 ? (
                <p className="m-0 text-sm text-muted">Fila zerada.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {pending.slice(0, 3).map((d) => (
                    <Link
                      key={d.id}
                      href={`/revisao?id=${d.id}`}
                      className="flex flex-col gap-2 rounded-xl border border-line-soft bg-surface-2 p-2.5 text-ink no-underline hover:border-line-field"
                    >
                      {/* PNG do preview (route handler). */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/drafts/${d.id}/preview`}
                        alt=""
                        loading="lazy"
                        width={1080}
                        height={1350}
                        className="aspect-[4/5] w-full rounded-lg bg-post-bg object-cover"
                      />
                      <span className="line-clamp-2 text-[13px] leading-[1.35] font-semibold">
                        {d.shortTitle}
                      </span>
                      <span className="text-xs text-muted">
                        {d.source} · {formatAge(d.createdAt, now)}
                        {d.qualityScore !== null && ` · nota ${d.qualityScore}`}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            {(lowScore.length > 0 ||
              expiring.length > 0 ||
              failingSources.length > 0) && (
              <section
                aria-label="Precisa da sua atenção"
                className="flex flex-col gap-2.5 rounded-2xl border border-[#EBD9B0] bg-warn-bg p-5"
              >
                <h2 className="m-0 text-base font-semibold text-warn-ink">
                  Precisa da sua atenção
                </h2>
                {lowScore.length > 0 && (
                  <Link
                    href="/revisao?tab=nota-baixa"
                    className="text-sm text-ink"
                  >
                    {lowScore.length}{" "}
                    {lowScore.length === 1
                      ? "pendente com nota abaixo do piso"
                      : "pendentes com nota abaixo do piso"}{" "}
                    ({QUALITY_MIN_SCORE})
                  </Link>
                )}
                {failingSources.length > 0 && (
                  <Link href="/fontes" className="text-sm text-ink">
                    {failingSources.join(", ")}{" "}
                    {failingSources.length === 1 ? "falhou" : "falharam"} nas
                    últimas 3 rodadas
                  </Link>
                )}
                {expiring.length > 0 && (
                  <Link href="/descartados" className="text-sm text-ink">
                    {expiring.length}{" "}
                    {expiring.length === 1
                      ? "descartado some"
                      : "descartados somem"}{" "}
                    em até 5 dias
                  </Link>
                )}
              </section>
            )}

            <section aria-label="Sua semana" className={card}>
              <h2 className="m-0 mb-4 text-base font-semibold">Sua semana</h2>
              <dl className="m-0 grid grid-cols-3 gap-3">
                {[
                  ["Aprovados", week.approved],
                  ["Descartados", week.rejected],
                  ["Aprovação", rate === null ? "—" : `${rate}%`],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-1">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="m-0 font-mono text-[22px] font-semibold">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="m-0 mt-3 text-xs text-muted">Últimos 7 dias.</p>
            </section>

            <section aria-label="O que aprendi" className={card}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="m-0 text-base font-semibold">
                  O que aprendi esta semana
                </h2>
              </div>
              {lessons.length === 0 ? (
                <p className="m-0 text-sm text-muted">
                  Nenhuma lição nova nos últimos 7 dias. Aprovar e descartar com
                  motivo ensina o assistente.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {lessons.map((l) => (
                    <li
                      key={l.id}
                      className="flex gap-2.5 text-[13px] leading-[1.45]"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2 w-2 flex-none rounded-full ${
                          l.source === "FEEDBACK_APPROVED"
                            ? "bg-approve"
                            : "bg-discard"
                        }`}
                      />
                      <span
                        className={l.active ? "" : "text-muted line-through"}
                      >
                        <span className="font-semibold">
                          {l.source === "FEEDBACK_APPROVED"
                            ? "Exemplo aprovado"
                            : "Evitar"}
                          :
                        </span>{" "}
                        {lessonLine(l.content)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
