"use client";

import { useMemo, useState } from "react";

import { callApi } from "@/components/ui/client-api";
import {
  classifyCategory,
  DEFAULT_CATEGORY_ID,
  MAX_CATEGORY_RULES,
  resolveCategory,
  type CategoriesConfig,
  type CategoryRule,
} from "@/lib/categories";

import { ColorField } from "./color-field";

const card = "rounded-2xl border border-line bg-surface p-5 md:p-6";
const input =
  "h-10 w-full rounded-[10px] border border-line-field bg-surface px-3 text-sm text-ink";
const btn =
  "h-10 rounded-[10px] border border-line-field bg-surface px-3 text-[13px] font-medium text-ink disabled:opacity-40";
const btnPrimary =
  "h-11 rounded-[10px] border-0 bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60";

const PALETTE = [
  "#FF7A59",
  "#5BC0EB",
  "#9BE564",
  "#E8B04B",
  "#C792EA",
  "#F472B6",
  "#22D3EE",
];

function slugify(label: string, taken: Set<string>): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 34) || "categoria";
  let id = base === DEFAULT_CATEGORY_ID ? `${base}-2` : base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

/**
 * Categorias novas (ainda não salvas) ganham o id a partir do nome na hora de
 * salvar; as já salvas mantêm o id (ele liga a Memória e as prévias).
 */
function withFinalIds(
  config: CategoriesConfig,
  savedIds: Set<string>,
): CategoriesConfig {
  const taken = new Set(
    config.rules.filter((r) => savedIds.has(r.id)).map((r) => r.id),
  );
  return {
    ...config,
    rules: config.rules.map((r) => {
      if (savedIds.has(r.id)) return r;
      const id = slugify(r.label, taken);
      taken.add(id);
      return { ...r, id };
    }),
  };
}

/** Chips de palavras-gatilho de uma categoria. */
function TriggerWords({
  id,
  items,
  onChange,
}: {
  id: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add(raw: string) {
    const seen = new Set(items.map((i) => i.toLowerCase()));
    const fresh = raw
      .split(/[,;\n]/)
      .map((p) => p.trim())
      .filter(
        (p) =>
          p && !seen.has(p.toLowerCase()) && (seen.add(p.toLowerCase()), true),
      );
    if (fresh.length) onChange([...items, ...fresh]);
    setDraft("");
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((k) => (
          <span
            key={k}
            className="flex items-center gap-0.5 rounded-md bg-accent-soft py-0.5 pr-0.5 pl-2 font-mono text-xs text-accent-ink"
          >
            {k}
            <button
              type="button"
              aria-label={`Remover ${k}`}
              onClick={() => onChange(items.filter((x) => x !== k))}
              className="h-7 w-7 rounded hover:bg-black/5"
            >
              ×
            </button>
          </span>
        ))}
        {items.length === 0 && (
          <span className="text-xs font-semibold text-discard">
            Adicione ao menos uma palavra.
          </span>
        )}
      </div>
      <label htmlFor={id} className="sr-only">
        Adicionar palavra-gatilho
      </label>
      <input
        id={id}
        value={draft}
        placeholder="Palavra que ativa a categoria (Enter; * no fim = começo de palavra, ex.: cripto*)"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          }
        }}
        onPaste={(e) => {
          const t = e.clipboardData.getData("text");
          if (/[,;\n]/.test(t)) {
            e.preventDefault();
            add(t);
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        className={`${input} h-9 text-[13px]`}
      />
    </div>
  );
}

/**
 * Categorias do post (DEC-028): rótulo no slide, cor de destaque, palavras que
 * ativam e prioridade (ordem). A categoria padrão vale quando nenhuma casa.
 */
export function CategoriesEditor({
  initial,
  version,
  onSaved,
}: {
  initial: CategoriesConfig;
  version: number;
  onSaved: (saved: CategoriesConfig) => void;
}) {
  const [config, setConfig] = useState<CategoriesConfig>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState("");

  const dirty = JSON.stringify(config) !== saved;
  const savedIds = useMemo(
    () =>
      new Set((JSON.parse(saved) as CategoriesConfig).rules.map((r) => r.id)),
    [saved],
  );
  const probeResult = probe.trim()
    ? resolveCategory(config, classifyCategory(probe, "", config))
    : null;

  const setRule = (id: string, patch: Partial<CategoryRule>) =>
    setConfig((c) => ({
      ...c,
      rules: c.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

  function move(index: number, delta: -1 | 1) {
    setConfig((c) => {
      const to = index + delta;
      if (to < 0 || to >= c.rules.length) return c;
      const rules = [...c.rules];
      const [item] = rules.splice(index, 1);
      rules.splice(to, 0, item!);
      return { ...c, rules };
    });
  }

  function addRule() {
    setConfig((c) => {
      const label = "NOVA CATEGORIA";
      const id = slugify(
        `nova-${c.rules.length + 1}`,
        new Set(c.rules.map((r) => r.id)),
      );
      const accent = PALETTE[c.rules.length % PALETTE.length]!;
      return { ...c, rules: [...c.rules, { id, label, accent, keywords: [] }] };
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await callApi<{ settings: { categories: CategoriesConfig } }>(
        "/api/settings",
        {
          method: "PATCH",
          body: { categories: withFinalIds(config, savedIds) },
        },
      );
      setConfig(res.settings.categories);
      setSaved(JSON.stringify(res.settings.categories));
      onSaved(res.settings.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Categorias" className={card}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[640px]">
          <h2 className="m-0 text-base font-semibold">Categorias</h2>
          <p className="m-0 text-[13px] leading-normal text-muted">
            Cada post recebe uma categoria: o rótulo aparece no slide como “[
            RÓTULO ]” e a cor de destaque muda. A primeira categoria (de cima
            para baixo) cujas palavras aparecem no título ou no começo da
            legenda vence; se nenhuma aparecer, vale a categoria padrão.
          </p>
        </div>
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={() => void save()}
          className={btnPrimary}
        >
          {busy ? "Salvando…" : "Salvar categorias"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="m-0 mb-4 rounded-xl bg-discard-soft px-4 py-3 text-sm text-discard"
        >
          {error}
        </p>
      )}

      <div className="mb-5 flex flex-col gap-2 rounded-xl bg-surface-2 p-4">
        <label htmlFor="cat-probe" className="text-[13px] font-semibold">
          Testar: em qual categoria cai este título?
        </label>
        <input
          id="cat-probe"
          value={probe}
          placeholder="Ex.: Startup anuncia rodada de investimento em IA"
          onChange={(e) => setProbe(e.target.value)}
          className={input}
        />
        {probeResult && (
          <span role="status" className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full"
              style={{ background: probeResult.accent }}
            />
            <span className="font-mono text-xs font-semibold">
              [ {probeResult.label.toUpperCase()} ]
            </span>
            {probeResult.id === DEFAULT_CATEGORY_ID && (
              <span className="text-muted">
                — nenhuma palavra casou; vale a padrão
              </span>
            )}
          </span>
        )}
      </div>

      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {config.rules.map((r, i) => (
          <li
            key={r.id}
            className="grid gap-4 rounded-xl border border-line-soft p-4 md:grid-cols-[140px_minmax(0,1fr)]"
          >
            <div className="flex flex-col gap-2">
              {/* Capa de demonstração (só para categorias já salvas). */}
              {savedIds.has(r.id) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={version}
                  src={`/api/brand/sample?variant=${r.id}&v=${version}`}
                  alt={`Capa de exemplo — ${r.label}`}
                  width={1080}
                  height={1350}
                  loading="lazy"
                  className="aspect-[4/5] w-full rounded-lg bg-post-bg"
                />
              ) : (
                <div className="flex aspect-[4/5] w-full items-center justify-center rounded-lg bg-post-bg p-2 text-center text-xs text-[#7C879E]">
                  Salve para ver a prévia
                </div>
              )}
              <span className="font-mono text-[11px] text-muted">
                prioridade {i + 1}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
                  <label
                    htmlFor={`cat-${r.id}-label`}
                    className="text-[13px] font-semibold"
                  >
                    Nome no slide
                  </label>
                  <input
                    id={`cat-${r.id}-label`}
                    value={r.label}
                    maxLength={24}
                    onChange={(e) => setRule(r.id, { label: e.target.value })}
                    className={`${input} font-mono uppercase`}
                  />
                </div>
                <ColorField
                  id={`cat-${r.id}-accent`}
                  label="Cor"
                  value={r.accent}
                  onChange={(v) => setRule(r.id, { accent: v })}
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Subir prioridade de ${r.label}`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className={`${btn} w-10 px-0`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Descer prioridade de ${r.label}`}
                    disabled={i === config.rules.length - 1}
                    onClick={() => move(i, 1)}
                    className={`${btn} w-10 px-0`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover categoria ${r.label}`}
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        rules: c.rules.filter((x) => x.id !== r.id),
                      }))
                    }
                    className={`${btn} text-discard`}
                  >
                    Remover
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">
                  Palavras que ativam
                </span>
                <TriggerWords
                  id={`cat-${r.id}-kw`}
                  items={r.keywords}
                  onChange={(keywords) => setRule(r.id, { keywords })}
                />
              </div>
            </div>
          </li>
        ))}

        <li className="grid gap-4 rounded-xl border border-dashed border-line-field bg-surface-2 p-4 md:grid-cols-[140px_minmax(0,1fr)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={version}
            src={`/api/brand/sample?variant=${DEFAULT_CATEGORY_ID}&v=${version}`}
            alt="Capa de exemplo — categoria padrão"
            width={1080}
            height={1350}
            loading="lazy"
            className="aspect-[4/5] w-full rounded-lg bg-post-bg"
          />
          <div className="flex flex-col gap-3">
            <span className="text-[13px] font-semibold">
              Categoria padrão{" "}
              <span className="font-normal text-muted">
                — quando nenhuma palavra acima aparece
              </span>
            </span>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
                <label
                  htmlFor="cat-default-label"
                  className="text-[13px] font-semibold"
                >
                  Nome no slide
                </label>
                <input
                  id="cat-default-label"
                  value={config.fallback.label}
                  maxLength={24}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      fallback: { ...c.fallback, label: e.target.value },
                    }))
                  }
                  className={`${input} font-mono uppercase`}
                />
              </div>
              <ColorField
                id="cat-default-accent"
                label="Cor"
                value={config.fallback.accent}
                onChange={(v) =>
                  setConfig((c) => ({
                    ...c,
                    fallback: { ...c.fallback, accent: v },
                  }))
                }
              />
            </div>
          </div>
        </li>
      </ol>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={config.rules.length >= MAX_CATEGORY_RULES}
          onClick={addRule}
          className={btn}
        >
          + Nova categoria
        </button>
        <span className="text-xs text-muted">
          {config.rules.length}/{MAX_CATEGORY_RULES} categorias além da padrão.
          {dirty && " Alterações não salvas."}
        </span>
      </div>
    </section>
  );
}
