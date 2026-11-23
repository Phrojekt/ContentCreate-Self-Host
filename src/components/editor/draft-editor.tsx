"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { callApi } from "@/components/ui/client-api";
import { EDIT_LIMITS } from "@/constants/editor";
import { SLIDE_TYPE_LABEL } from "@/constants/ui";
import type { SlideContent, SlideType } from "@/types";

const CAPTION_MAX = EDIT_LIMITS.caption;
const HASHTAGS_MAX = EDIT_LIMITS.hashtags;
const AUTOSAVE_MS = 1200;

/** Tipos que o editor oferece para slides de corpo (a capa é fixa). */
const BODY_TYPES: SlideType[] = [
  "context",
  "stat",
  "comparison",
  "quote",
  "closing",
];

interface Content {
  shortTitle: string;
  caption: string;
  hashtags: string[];
  slides: SlideContent[];
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

type AssistKey = "shorter" | "direct" | "number" | "rewrite";
const ASSIST_OPTIONS: [AssistKey, string][] = [
  ["shorter", "Mais curto"],
  ["direct", "Mais direto"],
  ["number", "Virar um número"],
  ["rewrite", "Reescrever"],
];
interface AssistState {
  loading: AssistKey | null;
  error: string | null;
  suggestion: { slide: SlideContent; warnings: string[] } | null;
}

const field =
  "w-full rounded-[10px] border border-line-field bg-surface px-3 py-2.5 text-sm text-ink";
const labelCls = "text-[13px] font-semibold";

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function DraftEditor({
  id,
  initial,
  hasSlides,
  source,
  createdLabel,
  editedLabel,
  variantLabel,
  accent,
  width,
  height,
}: {
  id: string;
  initial: Content;
  hasSlides: boolean;
  source: string;
  createdLabel: string;
  editedLabel: string | null;
  variantLabel: string;
  accent: string;
  width: number;
  height: number;
}) {
  const router = useRouter();
  const [content, setContent] = useState<Content>(initial);
  /** 0 = capa; i ≥ 1 = slides[i − 1]. */
  const [selected, setSelected] = useState(0);
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [tagInput, setTagInput] = useState("");
  const [approving, setApproving] = useState(false);
  /** Avisos do servidor no último salvamento (não bloqueiam). */
  const [warnings, setWarnings] = useState<string[]>([]);
  const [assist, setAssist] = useState<AssistState>({
    loading: null,
    error: null,
    suggestion: null,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(content);

  const persist = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSave("saving");
    try {
      const c = latest.current;
      const res = await callApi<{ warnings?: string[] }>(`/api/drafts/${id}`, {
        method: "PATCH",
        body: {
          shortTitle: c.shortTitle,
          caption: c.caption,
          hashtags: c.hashtags,
          ...(hasSlides ? { slides: c.slides } : {}),
        },
      });
      setSave("saved");
      setError(null);
      setWarnings(res.warnings ?? []);
      setPreviewVersion((v) => v + 1);
      return true;
    } catch (err) {
      setSave("error");
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
      return false;
    }
  }, [hasSlides, id]);

  /** Aplica uma mudança e agenda o salvamento automático (debounce). */
  const update = useCallback(
    (fn: (c: Content) => Content) => {
      setContent((prev) => {
        const next = fn(prev);
        latest.current = next;
        return next;
      });
      setSave("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void persist(), AUTOSAVE_MS);
    },
    [persist],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Avisa ao sair com alteração pendente.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (save === "dirty" || save === "saving") e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [save]);

  const slide = selected > 0 ? content.slides[selected - 1] : undefined;
  const cmp = slide?.comparison;

  function setSlide(patch: Partial<SlideContent>) {
    update((c) => ({
      ...c,
      slides: c.slides.map((s, i) =>
        i === selected - 1 ? { ...s, ...patch } : s,
      ),
    }));
  }

  function moveSlide(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (to < 0 || to >= content.slides.length) return;
    update((c) => {
      const slides = [...c.slides];
      const [item] = slides.splice(index, 1);
      slides.splice(to, 0, item!);
      return { ...c, slides };
    });
    if (selected === index + 1) setSelected(to + 1);
  }

  function changeType(type: SlideType) {
    const s = slide;
    if (!s) return;
    setSlide({
      slideType: type,
      ...(type === "stat" && !s.stat ? { stat: { value: "", label: "" } } : {}),
      ...(type === "comparison" && !s.comparison
        ? {
            comparison: {
              leftLabel: "Antes",
              leftValue: "",
              rightLabel: "Agora",
              rightValue: "",
            },
          }
        : {}),
      ...(type === "quote" && !s.quote
        ? { quote: { text: "", author: "", role: "" } }
        : {}),
    });
  }

  function addTag(raw: string) {
    const tag = raw.replace(/^#+/, "").trim();
    if (!tag) return;
    if (content.hashtags.some((t) => t.toLowerCase() === tag.toLowerCase()))
      return;
    if (content.hashtags.length >= HASHTAGS_MAX) return;
    update((c) => ({ ...c, hashtags: [...c.hashtags, tag] }));
    setTagInput("");
  }

  async function saveAndApprove() {
    setApproving(true);
    const ok = save === "saved" || save === "idle" ? true : await persist();
    if (!ok) {
      setApproving(false);
      return;
    }
    try {
      await callApi(`/api/drafts/${id}`, { body: { action: "approve" } });
      router.push("/revisao");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aprovar.");
      setApproving(false);
    }
  }

  /** Troca de slide descarta a sugestão pendente (era de outro slide). */
  function select(n: number) {
    setSelected(n);
    setAssist({ loading: null, error: null, suggestion: null });
  }

  async function askAssistant(instruction: AssistKey) {
    if (!slide) return;
    setAssist({ loading: instruction, error: null, suggestion: null });
    try {
      const res = await callApi<{ slide: SlideContent; warnings: string[] }>(
        `/api/drafts/${id}/assist`,
        { body: { index: selected, instruction, slide } },
      );
      setAssist({
        loading: null,
        error: null,
        suggestion: { slide: res.slide, warnings: res.warnings },
      });
    } catch (err) {
      setAssist({
        loading: null,
        error:
          err instanceof Error ? err.message : "Falha ao pedir ao assistente.",
        suggestion: null,
      });
    }
  }

  function applySuggestion() {
    if (!assist.suggestion) return;
    const next = assist.suggestion.slide;
    update((c) => ({
      ...c,
      slides: c.slides.map((s, i) => (i === selected - 1 ? next : s)),
    }));
    setAssist({ loading: null, error: null, suggestion: null });
  }

  const saveLabel: Record<SaveState, string> = {
    idle: editedLabel ? `editado em ${editedLabel}` : "sem edições",
    dirty: "alterações não salvas…",
    saving: "salvando…",
    saved: "alterações salvas",
    error: "não foi possível salvar",
  };

  const totalSlides = 1 + (hasSlides ? content.slides.length : 0);
  const previewIndex = hasSlides ? selected + 1 : 1;

  return (
    <main className="px-5 pt-5 pb-10 md:px-8 md:pt-7">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <nav
            aria-label="Caminho"
            className="flex gap-1.5 text-[13px] text-muted"
          >
            <Link href={`/revisao?id=${id}`}>Revisão</Link>
            <span aria-hidden="true">/</span>
            <span>Editar rascunho</span>
          </nav>
          <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] md:text-[24px]">
            {content.shortTitle || "Sem título"}
          </h1>
          <span
            className="text-[13px] text-muted"
            role="status"
            aria-live="polite"
          >
            {source} · gerado em {createdLabel} · {saveLabel[save]}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void persist()}
            disabled={save === "saving" || approving}
            className="h-11 rounded-[10px] border border-line-field bg-surface px-4 text-sm font-medium text-ink disabled:opacity-50"
          >
            Salvar agora
          </button>
          <button
            type="button"
            onClick={() => void saveAndApprove()}
            disabled={approving}
            className="h-11 rounded-[10px] border-0 bg-approve px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {approving ? "Exportando…" : "Salvar e aprovar"}
          </button>
        </div>
      </header>

      {warnings.length > 0 && !error && (
        <div
          role="status"
          className="mb-4 flex flex-col gap-1 rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink"
        >
          <strong className="font-semibold">Salvo, com avisos:</strong>
          {warnings.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-discard-soft px-4 py-3 text-sm text-discard"
        >
          {error}
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Slides */}
        <section aria-label="Slides" className="flex flex-col gap-1.5">
          <span className="px-1 pb-1 text-xs font-semibold text-muted">
            {totalSlides} {totalSlides === 1 ? "slide" : "slides"} · use ↑ ↓
            para reordenar
          </span>
          <button
            type="button"
            aria-current={selected === 0 ? "true" : undefined}
            onClick={() => select(0)}
            className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left ${
              selected === 0
                ? "border-accent bg-accent-soft"
                : "border-line bg-surface"
            }`}
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ background: accent }}
            />
            <span className="flex min-w-0 flex-col">
              <span className="font-mono text-[11px] text-muted">
                01 · CAPA
              </span>
              <span className="truncate text-[13px] font-medium">
                {content.shortTitle}
              </span>
            </span>
          </button>
          {hasSlides &&
            content.slides.map((s, i) => {
              const on = selected === i + 1;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-1 rounded-xl border pr-1 ${
                    on
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-surface"
                  }`}
                >
                  <button
                    type="button"
                    aria-current={on ? "true" : undefined}
                    onClick={() => select(i + 1)}
                    className="flex min-w-0 flex-1 flex-col p-2.5 text-left"
                  >
                    <span className="font-mono text-[11px] text-muted">
                      {String(i + 2).padStart(2, "0")} ·{" "}
                      {SLIDE_TYPE_LABEL[s.slideType ?? "context"]}
                    </span>
                    <span className="truncate text-[13px] font-medium">
                      {s.lead || s.body.slice(0, 40)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Subir slide ${i + 2}`}
                    disabled={i === 0}
                    onClick={() => moveSlide(i, -1)}
                    className="h-10 w-8 rounded-md text-ink-2 hover:bg-chip disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Descer slide ${i + 2}`}
                    disabled={i === content.slides.length - 1}
                    onClick={() => moveSlide(i, 1)}
                    className="h-10 w-8 rounded-md text-ink-2 hover:bg-chip disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
              );
            })}
          {!hasSlides && (
            <p className="m-0 px-1 text-xs text-muted">
              Este rascunho não tem slides próprios — o corpo do carrossel sai
              da legenda.
            </p>
          )}
        </section>

        {/* Prévia */}
        <section
          aria-label="Prévia"
          className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-4 md:p-6"
        >
          <span className="self-start font-mono text-xs tracking-[0.06em] text-muted">
            {variantLabel} · SLIDE {previewIndex}/{totalSlides} · {width}×
            {height}
          </span>
          <div
            className="w-full max-w-[380px] overflow-hidden rounded-xl bg-post-bg"
            style={{ aspectRatio: `${width} / ${height}` }}
          >
            {/* PNG do preview (route handler) — recarrega após cada salvamento. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${previewIndex}-${previewVersion}`}
              src={`/api/drafts/${id}/preview?slide=${previewIndex}&v=${previewVersion}`}
              alt={`Prévia do slide ${previewIndex}`}
              width={width}
              height={height}
              className="h-full w-full object-contain"
            />
          </div>
          <p className="m-0 max-w-[380px] text-center text-xs leading-normal text-muted">
            A prévia usa o template atual e se atualiza depois de cada
            salvamento. Layout e cores vêm da marca — aqui você mexe só no
            conteúdo.
          </p>
        </section>

        {/* Formulário */}
        <section aria-label="Editar conteúdo" className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
            {selected === 0 || !slide ? (
              <>
                <h2 className="m-0 text-base font-semibold">Capa</h2>
                <Field
                  id="title"
                  label="Título curto"
                  hint={`${content.shortTitle.split(/\s+/).filter(Boolean).length} palavras · a frase de apoio da capa é a 1ª frase da legenda`}
                >
                  <input
                    id="title"
                    type="text"
                    maxLength={EDIT_LIMITS.shortTitle}
                    value={content.shortTitle}
                    onChange={(e) =>
                      update((c) => ({ ...c, shortTitle: e.target.value }))
                    }
                    className={field}
                  />
                </Field>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="m-0 text-base font-semibold">
                    Slide {String(selected + 1).padStart(2, "0")}
                  </h2>
                  <label className="flex items-center gap-2 text-[13px] font-semibold">
                    Tipo
                    <select
                      value={slide.slideType ?? "context"}
                      onChange={(e) => changeType(e.target.value as SlideType)}
                      className="h-10 rounded-[10px] border border-line-field bg-surface px-2 text-sm font-normal"
                    >
                      {BODY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {SLIDE_TYPE_LABEL[t].charAt(0) +
                            SLIDE_TYPE_LABEL[t].slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <Field id="eyebrow" label="Rótulo (opcional)">
                  <input
                    id="eyebrow"
                    type="text"
                    maxLength={EDIT_LIMITS.eyebrow}
                    value={slide.eyebrow ?? ""}
                    onChange={(e) => setSlide({ eyebrow: e.target.value })}
                    className={field}
                  />
                </Field>
                <Field id="lead" label="Gancho">
                  <input
                    id="lead"
                    type="text"
                    maxLength={EDIT_LIMITS.lead}
                    value={slide.lead}
                    onChange={(e) => setSlide({ lead: e.target.value })}
                    className={field}
                  />
                </Field>

                {slide.slideType === "stat" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="stat-value" label="Número">
                      <input
                        id="stat-value"
                        type="text"
                        maxLength={EDIT_LIMITS.statValue}
                        value={slide.stat?.value ?? ""}
                        onChange={(e) =>
                          setSlide({
                            stat: {
                              ...(slide.stat ?? { label: "" }),
                              value: e.target.value,
                            },
                          })
                        }
                        className={field}
                      />
                    </Field>
                    <Field id="stat-label" label="O que o número mede">
                      <input
                        id="stat-label"
                        type="text"
                        maxLength={EDIT_LIMITS.statLabel}
                        value={slide.stat?.label ?? ""}
                        onChange={(e) =>
                          setSlide({
                            stat: {
                              ...(slide.stat ?? { value: "" }),
                              label: e.target.value,
                            },
                          })
                        }
                        className={field}
                      />
                    </Field>
                  </div>
                )}

                {slide.slideType === "comparison" && cmp && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["left", "right"] as const).map((side) => (
                      <fieldset
                        key={side}
                        className="m-0 flex flex-col gap-2 rounded-xl border border-line-soft p-3"
                      >
                        <legend className="px-1 text-[13px] font-semibold">
                          {side === "left" ? "Lado A" : "Lado B"}
                        </legend>
                        <input
                          aria-label={`Rótulo do ${side === "left" ? "lado A" : "lado B"}`}
                          type="text"
                          maxLength={EDIT_LIMITS.cmpLabel}
                          value={cmp[`${side}Label`]}
                          onChange={(e) =>
                            setSlide({
                              comparison: {
                                ...cmp,
                                [`${side}Label`]: e.target.value,
                              },
                            })
                          }
                          className={field}
                        />
                        <textarea
                          aria-label={`Valor do ${side === "left" ? "lado A" : "lado B"}`}
                          rows={2}
                          maxLength={EDIT_LIMITS.cmpValue}
                          value={cmp[`${side}Value`]}
                          onChange={(e) =>
                            setSlide({
                              comparison: {
                                ...cmp,
                                [`${side}Value`]: e.target.value,
                              },
                            })
                          }
                          className={field}
                        />
                      </fieldset>
                    ))}
                  </div>
                )}

                {slide.slideType === "quote" && slide.quote && (
                  <div className="flex flex-col gap-3">
                    <Field id="q-text" label="Citação (frase real da matéria)">
                      <textarea
                        id="q-text"
                        rows={3}
                        maxLength={EDIT_LIMITS.quoteText}
                        value={slide.quote.text}
                        onChange={(e) =>
                          setSlide({
                            quote: { ...slide.quote!, text: e.target.value },
                          })
                        }
                        className={field}
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field id="q-author" label="Autor">
                        <input
                          id="q-author"
                          type="text"
                          maxLength={EDIT_LIMITS.quoteAuthor}
                          value={slide.quote.author}
                          onChange={(e) =>
                            setSlide({
                              quote: {
                                ...slide.quote!,
                                author: e.target.value,
                              },
                            })
                          }
                          className={field}
                        />
                      </Field>
                      <Field id="q-role" label="Cargo">
                        <input
                          id="q-role"
                          type="text"
                          maxLength={EDIT_LIMITS.quoteRole}
                          value={slide.quote.role}
                          onChange={(e) =>
                            setSlide({
                              quote: { ...slide.quote!, role: e.target.value },
                            })
                          }
                          className={field}
                        />
                      </Field>
                    </div>
                  </div>
                )}

                <Field
                  id="body"
                  label="Texto"
                  hint={`${slide.body.length} caracteres`}
                >
                  <textarea
                    id="body"
                    rows={5}
                    maxLength={EDIT_LIMITS.body}
                    value={slide.body}
                    onChange={(e) => setSlide({ body: e.target.value })}
                    className={field}
                  />
                </Field>

                <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
                  <span className="text-[13px] font-semibold">
                    Pedir ao assistente{" "}
                    <span className="font-normal text-muted">
                      — sugere; nada muda até você usar
                    </span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ASSIST_OPTIONS.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        disabled={assist.loading !== null}
                        onClick={() => void askAssistant(key)}
                        className="h-10 rounded-full border border-line-field bg-surface px-3.5 text-[13px] font-medium text-ink disabled:opacity-50"
                      >
                        {assist.loading === key ? "Pensando…" : label}
                      </button>
                    ))}
                  </div>
                  {assist.error && (
                    <p role="alert" className="m-0 text-[13px] text-discard">
                      {assist.error}
                    </p>
                  )}
                  {assist.suggestion && (
                    <div className="flex flex-col gap-2 rounded-xl border border-[#D9DAF5] bg-accent-soft p-3.5">
                      <span className="font-mono text-[11px] text-accent-ink">
                        SUGESTÃO ·{" "}
                        {
                          SLIDE_TYPE_LABEL[
                            assist.suggestion.slide.slideType ?? "context"
                          ]
                        }
                      </span>
                      {assist.suggestion.slide.stat && (
                        <span className="font-mono text-lg font-semibold">
                          {assist.suggestion.slide.stat.value}{" "}
                          <span className="text-sm font-normal">
                            {assist.suggestion.slide.stat.label}
                          </span>
                        </span>
                      )}
                      <strong className="text-sm">
                        {assist.suggestion.slide.lead}
                      </strong>
                      <p className="m-0 text-sm leading-normal">
                        {assist.suggestion.slide.body}
                      </p>
                      {assist.suggestion.warnings.map((w) => (
                        <p key={w} className="m-0 text-xs text-warn-ink">
                          {w}
                        </p>
                      ))}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={applySuggestion}
                          className="h-10 rounded-[10px] bg-accent px-3.5 text-[13px] font-semibold text-white"
                        >
                          Usar sugestão
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAssist({
                              loading: null,
                              error: null,
                              suggestion: null,
                            })
                          }
                          className="h-10 rounded-[10px] border border-line-field bg-surface px-3.5 text-[13px] font-medium"
                        >
                          Descartar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
            <Field
              id="caption"
              label="Legenda"
              hint={
                <span
                  className={
                    content.caption.length > CAPTION_MAX
                      ? "font-semibold text-discard"
                      : ""
                  }
                >
                  {content.caption.length} / {CAPTION_MAX} · mantenha o “Fonte:
                  …” no fim (crédito obrigatório)
                </span>
              }
            >
              <textarea
                id="caption"
                rows={7}
                value={content.caption}
                onChange={(e) =>
                  update((c) => ({ ...c, caption: e.target.value }))
                }
                className={field}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tags" className={labelCls}>
                Hashtags{" "}
                <span className="font-normal text-muted">
                  {content.hashtags.length}/{HASHTAGS_MAX}
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {content.hashtags.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 rounded-md bg-accent-soft py-0.5 pr-0.5 pl-2 font-mono text-xs text-accent-ink"
                  >
                    #{t}
                    <button
                      type="button"
                      aria-label={`Remover #${t}`}
                      onClick={() =>
                        update((c) => ({
                          ...c,
                          hashtags: c.hashtags.filter((x) => x !== t),
                        }))
                      }
                      className="h-7 w-7 rounded text-accent-ink hover:bg-accent-soft-2"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                id="tags"
                type="text"
                value={tagInput}
                placeholder="Adicionar hashtag e Enter"
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                onBlur={() => addTag(tagInput)}
                className={field}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
