"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { callApi } from "@/components/ui/client-api";
import { IconChevronLeft, IconChevronRight } from "@/components/ui/icons";
import { Toast, useToast } from "@/components/ui/toast";

export interface ReadyItem {
  id: string;
  title: string;
  source: string;
  approvedAge: string;
  /** Igual ao `caption.txt` exportado: legenda + linha de hashtags. */
  captionText: string;
  /** Arquivos existentes na pasta exportada. */
  files: string[];
  coverUrl: string;
}

export interface AgendaDay {
  iso: string;
  weekday: string;
  day: number;
  isToday: boolean;
  items: { id: string; title: string; time: string }[];
}

const btn =
  "h-10 rounded-lg border border-line-field bg-surface px-2.5 text-[13px] text-ink disabled:opacity-50";

export function AgendaBoard({
  ready,
  days,
  label,
  prevWeek,
  nextWeek,
  publishedThisWeek,
}: {
  ready: ReadyItem[];
  days: AgendaDay[];
  label: string;
  prevWeek: string;
  nextWeek: string;
  publishedThisWeek: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { toast, show, hide } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<string | null>(null);

  async function copy(item: ReadyItem) {
    try {
      await navigator.clipboard.writeText(item.captionText);
      show({ message: "Legenda copiada (com hashtags)." });
    } catch {
      show({ message: "Não foi possível copiar.", tone: "error" });
    }
  }

  async function markPublished(item: ReadyItem) {
    setBusy(item.id);
    try {
      await callApi(`/api/drafts/${item.id}`, { body: { action: "publish" } });
      show({ message: "Marcado como publicado." });
      startTransition(() => router.refresh());
    } catch (err) {
      show({
        message: err instanceof Error ? err.message : "Falha.",
        tone: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="px-5 pt-5 pb-10 md:px-10 md:pt-7 md:pb-12">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-[22px]">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] md:text-[26px]">
              Agenda
            </h1>
            <p className="m-0 text-sm leading-normal text-muted">
              O que você aprovou e o que já foi ao ar. Os pacotes ficam na pasta
              do agendador, prontos para postar.
            </p>
          </div>
        </header>

        <section
          aria-label="Prontos para publicar"
          className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface px-6 py-[22px]"
        >
          <h2 className="m-0 text-base font-semibold">
            Prontos para publicar{" "}
            <span className="font-mono text-[13px] font-medium text-muted">
              {ready.length}
            </span>
          </h2>
          {ready.length === 0 ? (
            <p className="m-0 text-sm text-muted">
              Nada aprovado aguardando. Aprove rascunhos na{" "}
              <Link href="/revisao">Revisão</Link>.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3.5">
              {ready.map((item) => (
                <div
                  key={item.id}
                  className="flex min-w-0 flex-[1_1_320px] gap-3.5 rounded-[14px] border border-line-soft bg-surface-2 p-3"
                >
                  {/* PNG exportado servido por route handler. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.coverUrl}
                    alt=""
                    width={88}
                    height={110}
                    loading="lazy"
                    className="h-[110px] w-[88px] flex-none rounded-lg bg-post-bg object-cover"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="text-sm leading-[1.35] font-semibold">
                      {item.title}
                    </span>
                    <span className="text-xs text-muted">
                      {item.source} · aprovado {item.approvedAge}
                    </span>
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => void copy(item)}
                        className={btn}
                      >
                        Copiar legenda
                      </button>
                      <button
                        type="button"
                        aria-expanded={openFiles === item.id}
                        disabled={item.files.length === 0}
                        onClick={() =>
                          setOpenFiles((v) => (v === item.id ? null : item.id))
                        }
                        className={btn}
                      >
                        Baixar imagens
                      </button>
                      <button
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => void markPublished(item)}
                        className="h-10 rounded-lg border-0 bg-ink px-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
                      >
                        {busy === item.id ? "Salvando…" : "Já postei"}
                      </button>
                    </div>
                    {openFiles === item.id && (
                      <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[13px]">
                        {item.files.map((f) => (
                          <li key={f}>
                            <a
                              href={`/api/drafts/${item.id}/files/${f}`}
                              download
                            >
                              {f}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          aria-label="Publicados na semana"
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-base font-semibold">
              Publicados na semana{" "}
              <span className="font-mono text-[13px] font-medium text-muted">
                {publishedThisWeek}
              </span>
            </h2>
            <div className="flex items-center gap-1.5">
              <Link
                href={`/agenda?semana=${prevWeek}`}
                aria-label="Semana anterior"
                className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-line-field bg-surface text-ink-2"
              >
                <IconChevronLeft size={16} />
              </Link>
              <span className="px-2 text-sm font-semibold">{label}</span>
              <Link
                href={`/agenda?semana=${nextWeek}`}
                aria-label="Próxima semana"
                className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-line-field bg-surface text-ink-2"
              >
                <IconChevronRight size={16} />
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="overflow-x-auto">
              <div className="grid min-w-[840px] grid-cols-7">
                {days.map((d) => (
                  <div
                    key={d.iso}
                    className={`flex min-h-[180px] flex-col gap-2 border-r border-line-soft p-3 last:border-r-0 ${
                      d.isToday ? "bg-accent-soft/40" : ""
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">
                        {d.weekday}
                      </span>
                      <span
                        className={`font-mono text-[13px] ${
                          d.isToday
                            ? "rounded-md bg-accent px-1.5 font-semibold text-white"
                            : "text-ink-2"
                        }`}
                      >
                        {d.day}
                      </span>
                    </div>
                    {d.items.map((it) => (
                      <div
                        key={it.id}
                        className="flex flex-col gap-1 rounded-lg border border-[#B9DAC5] bg-approve-soft p-2"
                      >
                        <span className="font-mono text-[11px] text-muted">
                          {it.time} · publicado
                        </span>
                        <span className="text-[13px] leading-[1.35] font-medium text-ink">
                          {it.title}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
      <Toast toast={toast} onClose={hide} />
    </main>
  );
}
