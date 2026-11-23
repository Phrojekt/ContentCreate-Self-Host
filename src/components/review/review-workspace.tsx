"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import {
  IconChevronLeft,
  IconChevronRight,
  IconEdit,
  IconExternal,
} from "@/components/ui/icons";
import { callApi, isTypingTarget } from "@/components/ui/client-api";
import { Toast, useToast } from "@/components/ui/toast";
import {
  RejectDialog,
  type RejectChoice,
} from "@/components/review/reject-dialog";
import {
  QUALITY_MIN_SCORE,
  qualityTone,
  type QualityTone,
} from "@/constants/quality";
import type { QualityCheck } from "@/lib/quality-checks";
import { SLIDE_TYPE_LABEL, type ReviewTab } from "@/constants/ui";
import type { DraftStatus, SlideType } from "@/types";

export interface ReviewItem {
  id: string;
  status: DraftStatus;
  shortTitle: string;
  caption: string;
  hashtags: string[];
  source: string;
  url: string;
  /** Idade já formatada no servidor ("há 6 h"). */
  age: string;
  /** Cor de destaque da categoria do post (variante). */
  accent: string;
  /** Nota do verificador (UI-21); null em rascunhos antigos. */
  score: number | null;
}

export interface SelectedDraft {
  id: string;
  variantLabel: string;
  accent: string;
  width: number;
  height: number;
  slides: { index: number; slideType: SlideType }[];
  /** Verificações automáticas legíveis (UI-21); null sem nota. */
  checks: QualityCheck[] | null;
  attempts: number | null;
}

const TABS: { key: ReviewTab; label: string }[] = [
  { key: "pendentes", label: "Pendentes" },
  { key: "nota-baixa", label: "Nota baixa" },
  { key: "aprovados", label: "Aprovados" },
];

const SCORE_STYLE: Record<QualityTone, string> = {
  good: "bg-approve-soft text-approve-ink",
  near: "bg-line-soft text-ink-2",
  low: "bg-warn-bg text-warn-ink",
};

function ScoreBadge({
  score,
  big = false,
}: {
  score: number | null;
  big?: boolean;
}) {
  if (score === null) {
    return (
      <span
        className="rounded-md bg-line-soft px-[7px] py-0.5 font-mono text-xs font-semibold text-muted"
        title="Sem nota (rascunho anterior à UI v2)"
      >
        —
      </span>
    );
  }
  return (
    <span
      className={`rounded-md font-mono font-semibold ${SCORE_STYLE[qualityTone(score)]} ${
        big ? "px-2 py-0.5 text-[13px]" : "px-[7px] py-0.5 text-xs"
      }`}
      title={`Nota de qualidade ${score}/100 (piso ${QUALITY_MIN_SCORE})`}
    >
      {big ? `Nota ${score}` : score}
    </span>
  );
}

const CHECK_ICON: Record<QualityCheck["state"], [string, string]> = {
  ok: ["✓", "bg-approve-soft text-approve-ink"],
  warn: ["!", "bg-warn-bg text-warn-ink"],
  bad: ["×", "bg-discard-soft text-discard"],
};

type Busy = "approve" | "reject" | "publish" | null;

function hrefFor(tab: ReviewTab, id?: string): string {
  const q = new URLSearchParams();
  if (tab !== "pendentes") q.set("tab", tab);
  if (id) q.set("id", id);
  const s = q.toString();
  return s ? `/revisao?${s}` : "/revisao";
}

function Kbd({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "discard" | "light";
}) {
  const cls =
    tone === "discard"
      ? "border-discard-line"
      : tone === "light"
        ? "border-white/40"
        : "border-line-field bg-surface";
  return (
    <kbd
      className={`rounded-[5px] border px-[5px] py-px font-mono text-[11px] ${cls}`}
    >
      {children}
    </kbd>
  );
}

export function ReviewWorkspace({
  tab,
  items,
  selected,
  pendingCount,
  lowCount,
}: {
  tab: ReviewTab;
  items: ReviewItem[];
  selected: SelectedDraft | null;
  pendingCount: number;
  lowCount: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { toast, show, hide } = useToast();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(selected?.id);

  // Troca de rascunho → volta ao slide 1 (ajuste de estado durante o render,
  // padrão recomendado pelo React em vez de efeito).
  if (selected?.id !== selectedId) {
    setSelectedId(selected?.id);
    setSlide(1);
    setShowDetails(false);
    setError(null);
  }

  const index = items.findIndex((d) => d.id === selected?.id);
  const current = index >= 0 ? items[index] : undefined;
  const totalSlides = selected?.slides.length ?? 0;

  const go = useCallback(
    (id: string | undefined, refresh = false) => {
      startTransition(() => {
        router.replace(hrefFor(tab, id), { scroll: false });
        if (refresh) router.refresh();
      });
    },
    [router, tab],
  );

  const move = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      const from = index < 0 ? 0 : index;
      const to = Math.min(items.length - 1, Math.max(0, from + delta));
      if (to !== from || index < 0) go(items[to]?.id);
    },
    [go, index, items],
  );

  /** Após uma decisão, o rascunho sai da lista: seleciona o próximo. */
  const nextAfterCurrent = useCallback(() => {
    const next = items[index + 1] ?? items[index - 1];
    return next?.id;
  }, [index, items]);

  /** "Desfazer" do toast: restaura (REJECTED → PENDING) e volta a ele (UI-11). */
  const undoReject = useCallback(
    async (id: string) => {
      try {
        await callApi(`/api/drafts/${id}`, { body: { action: "restore" } });
        show({ message: "Descarte desfeito — de volta à revisão." });
        startTransition(() => {
          router.replace(hrefFor("pendentes", id), { scroll: false });
          router.refresh();
        });
      } catch (err) {
        show({
          message: err instanceof Error ? err.message : "Falha ao desfazer.",
          tone: "error",
        });
      }
    },
    [router, show],
  );

  const act = useCallback(
    async (action: "approve" | "reject" | "publish", choice?: RejectChoice) => {
      if (!current || busy) return;
      const decided = current;
      setBusy(action);
      setError(null);
      try {
        await callApi(`/api/drafts/${decided.id}`, {
          body: { action, ...(choice ?? {}) },
        });
        setRejectOpen(false);
        if (action === "reject") {
          show({
            message: "Descartado — fica em Descartados por 30 dias.",
            action: {
              label: "Desfazer",
              run: () => void undoReject(decided.id),
            },
          });
        } else {
          show({
            message:
              action === "approve"
                ? "Aprovado — pacote exportado para a pasta do agendador."
                : "Marcado como publicado.",
          });
        }
        go(nextAfterCurrent(), true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro inesperado.");
      } finally {
        setBusy(null);
      }
    },
    [busy, current, go, nextAfterCurrent, show, undoReject],
  );

  const canApprove = current?.status === "PENDING";
  const canPublish = current?.status === "APPROVED";

  // Atalhos (UI-04): escopo desta tela; ignorados em campos de texto.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector("[role=dialog][aria-modal=true]")) return;
      const key = e.key.toLowerCase();
      if (key === "j") {
        e.preventDefault();
        move(1);
      } else if (key === "k") {
        e.preventDefault();
        move(-1);
      } else if (key === "a" && canApprove) {
        e.preventDefault();
        void act("approve");
      } else if (key === "r" && current && !busy) {
        e.preventDefault();
        setRejectOpen(true);
      } else if (key === "e" && canApprove && current && !busy) {
        e.preventDefault();
        router.push(`/revisao/${current.id}/editar`);
      } else if (key === "arrowright") {
        setSlide((s) => Math.min(totalSlides, s + 1));
      } else if (key === "arrowleft") {
        setSlide((s) => Math.max(1, s - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, busy, canApprove, current, move, router, totalSlides]);

  return (
    <main className="flex min-w-0 flex-col gap-5 px-5 pt-5 pb-40 md:px-8 md:pt-7 md:pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] md:text-[26px]">
            Revisão
          </h1>
          <p className="m-0 text-sm text-muted">
            <span className="md:hidden">
              {items.length > 0 ? `${index + 1} de ${items.length} · ` : ""}
            </span>
            {pendingCount} {pendingCount === 1 ? "pendente" : "pendentes"} ·
            nada vai para o Instagram sem a sua aprovação.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {items.length > 1 && (
            <div className="flex gap-1 md:hidden">
              <button
                type="button"
                aria-label="Rascunho anterior"
                disabled={index <= 0}
                onClick={() => move(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-line bg-surface text-ink-2 disabled:opacity-40"
              >
                <IconChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label="Próximo rascunho"
                disabled={index >= items.length - 1}
                onClick={() => move(1)}
                className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-line bg-surface text-ink-2 disabled:opacity-40"
              >
                <IconChevronRight size={16} />
              </button>
            </div>
          )}
          <div
            role="group"
            aria-label="Filtrar"
            className="flex rounded-[10px] bg-chip p-[3px]"
          >
            {TABS.map((t) => {
              const on = t.key === tab;
              return (
                <Link
                  key={t.key}
                  href={hrefFor(t.key)}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-[34px] items-center rounded-lg px-3 text-[13px] no-underline ${
                    on
                      ? "bg-surface font-semibold text-ink"
                      : "font-medium text-ink-2"
                  }`}
                >
                  {t.label}
                  {t.key === "nota-baixa" && lowCount > 0 && (
                    <span className="ml-1.5 font-mono text-[11px] text-warn-ink">
                      {lowCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          <span className="hidden flex-wrap gap-2.5 text-xs text-muted md:flex">
            <span>
              <Kbd>J</Kbd> <Kbd>K</Kbd> navegar
            </span>
            <span>
              <Kbd>A</Kbd> aprovar
            </span>
            <span>
              <Kbd>R</Kbd> descartar
            </span>
            <span>
              <Kbd>E</Kbd> editar
            </span>
          </span>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-field bg-surface p-10 text-center text-sm text-muted">
          {tab === "aprovados"
            ? "Nenhum rascunho aprovado aguardando publicação."
            : tab === "nota-baixa"
              ? "Nenhum pendente com nota abaixo do piso."
              : "Nenhum rascunho pendente. Rode a esteira para gerar novos rascunhos."}
        </div>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(300px,360px)]">
          {/* Coluna 1 — fila */}
          <section
            aria-label="Fila de rascunhos"
            className="hidden min-w-0 flex-col gap-1.5 md:row-span-2 md:flex xl:row-span-1"
          >
            {items.map((d) => {
              const on = d.id === current?.id;
              return (
                <Link
                  key={d.id}
                  href={hrefFor(tab, d.id)}
                  replace
                  scroll={false}
                  aria-current={on ? "true" : undefined}
                  className={`flex w-full items-start gap-3 rounded-xl border py-3 pr-3 pl-3.5 text-left no-underline ${
                    on
                      ? "border-line bg-surface shadow-[0_1px_2px_rgba(23,24,28,0.06)]"
                      : "border-transparent hover:bg-surface/60"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-2 w-2 flex-none rounded-full"
                    style={{ background: d.accent }}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm leading-[1.35] font-semibold text-ink">
                      {d.shortTitle}
                    </span>
                    <span className="text-xs text-muted">
                      {d.source} · {d.age}
                    </span>
                  </span>
                  <ScoreBadge score={d.score} />
                </Link>
              );
            })}
          </section>

          {/* Coluna 2 — preview */}
          {current && selected && (
            <section
              aria-label="Prévia do carrossel"
              className="flex min-w-0 flex-col items-center gap-3 rounded-[18px] border border-line bg-surface p-3 md:gap-[18px] md:rounded-2xl md:p-6"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="font-mono text-xs tracking-[0.06em] text-muted">
                  {selected.variantLabel} · {totalSlides}{" "}
                  {totalSlides === 1 ? "SLIDE" : "SLIDES"} · {selected.width}×
                  {selected.height}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label="Slide anterior"
                    disabled={slide <= 1}
                    onClick={() => setSlide((s) => Math.max(1, s - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-line bg-surface text-ink-2 disabled:opacity-40"
                  >
                    <IconChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Próximo slide"
                    disabled={slide >= totalSlides}
                    onClick={() =>
                      setSlide((s) => Math.min(totalSlides, s + 1))
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-line bg-surface text-ink-2 disabled:opacity-40"
                  >
                    <IconChevronRight size={16} />
                  </button>
                </div>
              </div>

              <div
                className="w-full max-w-[400px] overflow-hidden rounded-xl bg-post-bg"
                style={{
                  aspectRatio: `${selected.width} / ${selected.height}`,
                }}
              >
                {/* PNG renderizado sob demanda pelo route handler — next/image
                    não se aplica. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`${selected.id}-${slide}`}
                  src={`/api/drafts/${selected.id}/preview?slide=${slide}`}
                  alt={`Slide ${slide} de ${totalSlides}: ${current.shortTitle}`}
                  width={selected.width}
                  height={selected.height}
                  className="h-full w-full object-contain"
                />
              </div>

              {/* Tira de slides (desktop) */}
              <div className="hidden flex-wrap justify-center gap-2 md:flex">
                {selected.slides.map((s) => {
                  const on = s.index === slide;
                  return (
                    <button
                      key={s.index}
                      type="button"
                      onClick={() => setSlide(s.index)}
                      aria-label={`Ver slide ${s.index}: ${SLIDE_TYPE_LABEL[s.slideType]}`}
                      aria-pressed={on}
                      className="flex h-[90px] w-[72px] flex-col justify-between rounded-lg bg-post-bg p-2 text-left"
                      style={
                        on
                          ? {
                              outline: `2px solid ${selected.accent}`,
                              outlineOffset: 2,
                            }
                          : undefined
                      }
                    >
                      <span className="font-mono text-[10px] text-[#7C879E]">
                        {String(s.index).padStart(2, "0")}
                      </span>
                      <span className="font-mono text-[9px] tracking-[0.04em] text-[#EDF1FA]">
                        {SLIDE_TYPE_LABEL[s.slideType]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Pontos de slide (celular) */}
              <div className="flex justify-center gap-[5px] md:hidden">
                {selected.slides.map((s) => (
                  <button
                    key={s.index}
                    type="button"
                    aria-label={`Ver slide ${s.index}`}
                    aria-pressed={s.index === slide}
                    onClick={() => setSlide(s.index)}
                    className="flex h-6 w-4 items-center justify-center"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        s.index === slide ? "bg-ink" : "bg-line-field"
                      }`}
                    />
                  </button>
                ))}
              </div>

              <div className="flex w-full items-center justify-between px-1 md:hidden">
                <span className="text-[13px] text-muted">
                  {current.source} · {current.age}
                </span>
                <ScoreBadge score={current.score} />
              </div>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
                className="h-10 w-full rounded-[10px] border border-line bg-surface-2 text-[13px] font-medium text-ink md:hidden"
              >
                {showDetails ? "Esconder legenda" : "Ler legenda e detalhes"}
              </button>
            </section>
          )}

          {/* Coluna 3 — detalhes e ações */}
          {current && (
            <section
              aria-label="Detalhes do rascunho"
              className={`min-w-0 flex-col gap-3.5 md:col-start-2 md:flex xl:col-start-3 ${
                showDetails ? "flex" : "hidden"
              }`}
            >
              <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted">
                    Legenda
                  </span>
                  <p className="m-0 text-sm leading-[1.6] whitespace-pre-line text-ink">
                    {current.caption}
                  </p>
                </div>
                {current.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {current.hashtags.map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-accent-soft px-2 py-[3px] font-mono text-xs text-accent-ink"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <a
                  href={current.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium"
                >
                  Abrir matéria original em {current.source}
                  <IconExternal size={14} />
                </a>
              </div>

              <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted">
                    Verificações automáticas
                  </span>
                  <ScoreBadge score={current.score} big />
                </div>
                {selected?.checks ? (
                  <>
                    {selected.checks.map((c) => (
                      <div
                        key={c.key}
                        className="flex items-start gap-2.5 text-[13px] leading-[1.45]"
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 flex-none items-center justify-center rounded-md text-xs font-bold ${CHECK_ICON[c.state][1]}`}
                        >
                          {CHECK_ICON[c.state][0]}
                        </span>
                        <span>
                          <strong className="font-semibold">{c.label}</strong>{" "}
                          <span className="text-muted">— {c.note}</span>
                          <span className="sr-only">
                            {c.state === "ok"
                              ? " (ok)"
                              : c.state === "warn"
                                ? " (atenção)"
                                : " (falhou)"}
                          </span>
                        </span>
                      </div>
                    ))}
                    {selected.attempts && selected.attempts > 1 && (
                      <p className="m-0 text-xs text-muted">
                        Gerado em {selected.attempts} tentativas — esta é a
                        melhor.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="m-0 text-[13px] text-muted">
                    Sem verificações registradas — rascunho gerado antes da nota
                    de qualidade ser salva.
                  </p>
                )}
              </div>

              {error && (
                <p
                  role="alert"
                  className="m-0 rounded-xl bg-discard-soft px-4 py-3 text-sm text-discard"
                >
                  {error}
                </p>
              )}

              <ActionButtons
                className="hidden md:flex"
                busy={busy}
                canApprove={canApprove}
                canPublish={canPublish}
                onApprove={() => void act("approve")}
                onReject={() => setRejectOpen(true)}
                onPublish={() => void act("publish")}
                editHref={`/revisao/${current.id}/editar`}
              />
            </section>
          )}
        </div>
      )}

      {/* Ações fixas no rodapé (celular) */}
      {current && (
        <div className="fixed inset-x-0 bottom-[68px] z-20 border-t border-line bg-bg/95 px-5 py-3 backdrop-blur md:hidden">
          <ActionButtons
            mobile
            busy={busy}
            canApprove={canApprove}
            canPublish={canPublish}
            onApprove={() => void act("approve")}
            onReject={() => setRejectOpen(true)}
            onPublish={() => void act("publish")}
            editHref={`/revisao/${current.id}/editar`}
          />
        </div>
      )}

      <RejectDialog
        open={rejectOpen}
        title={current?.shortTitle ?? ""}
        busy={busy === "reject"}
        onCancel={() => setRejectOpen(false)}
        onConfirm={(choice) => void act("reject", choice)}
      />
      <Toast toast={toast} onClose={hide} />
    </main>
  );
}

function ActionButtons({
  className = "flex",
  mobile = false,
  busy,
  canApprove,
  canPublish,
  onApprove,
  onReject,
  onPublish,
  editHref,
}: {
  className?: string;
  mobile?: boolean;
  busy: Busy;
  canApprove: boolean;
  canPublish: boolean;
  onApprove: () => void;
  onReject: () => void;
  onPublish: () => void;
  editHref: string;
}) {
  const h = mobile ? "h-[52px] rounded-[14px] text-[15px]" : "h-12 rounded-xl";
  return (
    <div className={`${className} flex-wrap gap-2`}>
      <button
        type="button"
        disabled={busy !== null}
        onClick={onReject}
        className={`${h} flex flex-[1_1_110px] items-center justify-center gap-2 border border-discard-line bg-surface text-sm font-semibold text-discard disabled:opacity-50`}
      >
        {busy === "reject" ? "Descartando…" : "Descartar"}
        {!mobile && <Kbd tone="discard">R</Kbd>}
      </button>
      {canApprove && (
        <Link
          href={editHref}
          aria-label="Editar rascunho"
          className={`${h} flex ${mobile ? "w-[52px] flex-none" : "flex-[1_1_100px]"} items-center justify-center gap-2 border border-line-field bg-surface text-sm font-semibold text-ink no-underline`}
        >
          {mobile ? <IconEdit size={18} /> : "Editar"}
          {!mobile && <Kbd>E</Kbd>}
        </Link>
      )}
      {canApprove && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={onApprove}
          className={`${h} flex flex-[2_1_180px] items-center justify-center gap-2 border-0 bg-approve text-sm font-semibold text-white disabled:opacity-60`}
        >
          {busy === "approve"
            ? "Exportando…"
            : mobile
              ? "Aprovar"
              : "Aprovar e exportar"}
          {!mobile && <Kbd tone="light">A</Kbd>}
        </button>
      )}
      {canPublish && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={onPublish}
          className={`${h} flex flex-[2_1_180px] items-center justify-center gap-2 border-0 bg-accent text-sm font-semibold text-white disabled:opacity-60`}
        >
          {busy === "publish" ? "Salvando…" : "Já postei"}
        </button>
      )}
    </div>
  );
}
