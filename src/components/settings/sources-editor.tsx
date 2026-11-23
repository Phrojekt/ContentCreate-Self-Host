"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { callApi } from "@/components/ui/client-api";
import { Toast, useToast } from "@/components/ui/toast";
import type { AppSettingsData, FeedSetting } from "@/lib/settings-schema";

export interface FeedHealth {
  collected: number;
  selected: number;
  fullArticle: number;
  drafts: number;
  status: "ok" | "failed" | "failing" | "summary";
}

type Keywords = AppSettingsData["keywords"];

interface TestResult {
  ok: boolean;
  count: number;
  titles: string[];
  error?: string;
}

const card = "rounded-2xl border border-line bg-surface p-5 md:p-6";
const input =
  "h-10 w-full rounded-[10px] border border-line-field bg-surface px-3 text-sm text-ink";
const btn =
  "h-10 rounded-[10px] border border-line-field bg-surface px-3 text-[13px] font-medium text-ink disabled:opacity-50";
const btnPrimary =
  "h-11 rounded-[10px] border-0 bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60";

const HEALTH: Record<FeedHealth["status"], [string, string]> = {
  ok: ["OK", "bg-approve-soft text-approve-ink"],
  failed: ["Feed falhou", "bg-warn-bg text-warn-ink"],
  failing: ["Falhou nas últimas 3 rodadas", "bg-discard-soft text-discard"],
  summary: ["Só resumo (artigo bloqueado?)", "bg-warn-bg text-warn-ink"],
};

/** id estável a partir do nome (letras minúsculas, números e hífen). */
function slugify(name: string, taken: Set<string>): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "fonte";
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

function KeywordEditor({
  id,
  label,
  hint,
  items,
  tone,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  items: string[];
  tone: "neutral" | "discard";
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");
  const chip =
    tone === "discard"
      ? "bg-discard-soft text-discard"
      : "bg-accent-soft text-accent-ink";

  function add(raw: string) {
    const parts = raw
      .split(/[,;\n]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const seen = new Set(items.map((i) => i.toLowerCase()));
    const fresh = parts.filter(
      (p) => !seen.has(p.toLowerCase()) && (seen.add(p.toLowerCase()), true),
    );
    onChange([...items, ...fresh]);
    setDraft("");
  }

  const q = filter.trim().toLowerCase();
  const shown = q ? items.filter((k) => k.toLowerCase().includes(q)) : items;

  return (
    <section aria-label={label} className={card}>
      <h2 className="m-0 mb-1 text-base font-semibold">
        {label}{" "}
        <span className="font-mono text-[13px] font-medium text-muted">
          {items.length}
        </span>
      </h2>
      <p className="m-0 mb-3 text-[13px] text-muted">{hint}</p>
      <div className="mb-3 flex gap-2">
        <label htmlFor={`${id}-add`} className="sr-only">
          Adicionar em {label}
        </label>
        <input
          id={`${id}-add`}
          value={draft}
          placeholder="Adicionar (Enter ou vírgula; cole várias)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[,;\n]/.test(text)) {
              e.preventDefault();
              add(text);
            }
          }}
          className={input}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim()}
          className={btn}
        >
          Adicionar
        </button>
      </div>
      {items.length > 12 && (
        <>
          <label htmlFor={`${id}-filter`} className="sr-only">
            Filtrar {label}
          </label>
          <input
            id={`${id}-filter`}
            type="search"
            value={filter}
            placeholder="Filtrar"
            onChange={(e) => setFilter(e.target.value)}
            className={`${input} mb-3 h-9`}
          />
        </>
      )}
      <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
        {shown.map((k) => (
          <span
            key={k}
            className={`flex items-center gap-0.5 rounded-md py-0.5 pr-0.5 pl-2 font-mono text-xs ${chip}`}
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
          <span className="text-[13px] text-muted">Nenhuma.</span>
        )}
      </div>
    </section>
  );
}

export function SourcesEditor({
  initialFeeds,
  initialKeywords,
  health,
  statsNote,
  apiNote,
}: {
  initialFeeds: FeedSetting[];
  initialKeywords: Keywords;
  health: Record<string, FeedHealth>;
  statsNote: string;
  apiNote: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { toast, show, hide } = useToast();
  const [feeds, setFeeds] = useState<FeedSetting[]>(initialFeeds);
  const [keywords, setKeywords] = useState<Keywords>(initialKeywords);
  const [savedFeeds, setSavedFeeds] = useState(JSON.stringify(initialFeeds));
  const [savedKw, setSavedKw] = useState(JSON.stringify(initialKeywords));
  const [busy, setBusy] = useState<"feeds" | "keywords" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult | "loading">>(
    {},
  );
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const feedsDirty = JSON.stringify(feeds) !== savedFeeds;
  const kwDirty = JSON.stringify(keywords) !== savedKw;
  const activeCount = feeds.filter((f) => f.enabled).length;

  const setFeed = (id: string, patch: Partial<FeedSetting>) =>
    setFeeds((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  async function test(key: string, url: string, sourceName?: string) {
    setTests((t) => ({ ...t, [key]: "loading" }));
    try {
      const res = await callApi<TestResult>("/api/settings/test-feed", {
        body: { url, ...(sourceName ? { sourceName } : {}) },
      });
      setTests((t) => ({ ...t, [key]: res }));
      return res;
    } catch (err) {
      const res = {
        ok: false,
        count: 0,
        titles: [],
        error: err instanceof Error ? err.message : "Falha ao testar.",
      };
      setTests((t) => ({ ...t, [key]: res }));
      return res;
    }
  }

  function addFeed() {
    const name = newName.trim();
    const url = newUrl.trim();
    if (!name || !url) return;
    const id = slugify(name, new Set(feeds.map((f) => f.id)));
    setFeeds((list) => [...list, { id, sourceName: name, url, enabled: true }]);
    setTests((t) => ({ ...t, [id]: t["__new"] ?? "loading" }));
    setNewName("");
    setNewUrl("");
  }

  async function save(section: "feeds" | "keywords") {
    setBusy(section);
    setError(null);
    try {
      await callApi("/api/settings", {
        method: "PATCH",
        body: section === "feeds" ? { feeds } : { keywords },
      });
      if (section === "feeds") setSavedFeeds(JSON.stringify(feeds));
      else setSavedKw(JSON.stringify(keywords));
      show({ message: "Salvo — vale a partir da próxima rodada." });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy(null);
    }
  }

  const newTest = tests["__new"];

  return (
    <>
      {error && (
        <p
          role="alert"
          className="m-0 rounded-xl bg-discard-soft px-4 py-3 text-sm text-discard"
        >
          {error}
        </p>
      )}

      <section
        aria-label="Feeds"
        className="overflow-hidden rounded-2xl border border-line bg-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
          <h2 className="m-0 text-base font-semibold">
            Feeds RSS{" "}
            <span className="font-mono text-[13px] font-medium text-muted">
              {activeCount} ativos de {feeds.length}
            </span>
          </h2>
          <button
            type="button"
            disabled={!feedsDirty || busy !== null}
            onClick={() => void save("feeds")}
            className={btnPrimary}
          >
            {busy === "feeds" ? "Salvando…" : "Salvar fontes"}
          </button>
        </div>

        <ul className="m-0 flex list-none flex-col p-0">
          {feeds.map((f) => {
            const h = health[f.sourceName];
            const t = tests[f.id];
            return (
              <li
                key={f.id}
                className={`flex flex-col gap-2 border-b border-line-soft px-5 py-3.5 ${
                  f.enabled ? "" : "bg-surface-2"
                }`}
              >
                <div className="grid items-center gap-2 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,2fr)_auto_auto]">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={f.enabled}
                    aria-label={`${f.enabled ? "Pausar" : "Ativar"} ${f.sourceName}`}
                    onClick={() => setFeed(f.id, { enabled: !f.enabled })}
                    className="flex h-10 w-14 items-center justify-center"
                  >
                    <span
                      aria-hidden="true"
                      className={`relative h-6 w-10 rounded-full ${f.enabled ? "bg-approve" : "bg-line-field"}`}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow ${f.enabled ? "left-5" : "left-1"}`}
                      />
                    </span>
                  </button>
                  <input
                    aria-label={`Nome da fonte ${f.sourceName}`}
                    value={f.sourceName}
                    maxLength={80}
                    onChange={(e) =>
                      setFeed(f.id, { sourceName: e.target.value })
                    }
                    className={`${input} font-medium`}
                  />
                  <input
                    aria-label={`Endereço do feed ${f.sourceName}`}
                    value={f.url}
                    maxLength={500}
                    onChange={(e) => setFeed(f.id, { url: e.target.value })}
                    className={`${input} font-mono text-xs`}
                  />
                  <button
                    type="button"
                    disabled={t === "loading"}
                    onClick={() => void test(f.id, f.url, f.sourceName)}
                    className={btn}
                  >
                    {t === "loading" ? "Testando…" : "Testar"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover ${f.sourceName}`}
                    onClick={() =>
                      setFeeds((list) => list.filter((x) => x.id !== f.id))
                    }
                    className={`${btn} text-discard`}
                  >
                    Remover
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-0 text-xs text-muted md:pl-16">
                  {!f.enabled && (
                    <span className="font-semibold">
                      Pausada — não é coletada.
                    </span>
                  )}
                  {h ? (
                    <>
                      <span
                        className={`rounded-md px-2 py-0.5 font-semibold ${HEALTH[h.status][1]}`}
                      >
                        {HEALTH[h.status][0]}
                      </span>
                      <span className="font-mono">
                        {h.collected} coletadas · {h.selected} selecionadas ·{" "}
                        {h.selected
                          ? `${h.fullArticle}/${h.selected} artigo completo`
                          : "—"}{" "}
                        · {h.drafts} rascunhos
                      </span>
                    </>
                  ) : (
                    <span>sem dados de rodada</span>
                  )}
                  {t && t !== "loading" && (
                    <span
                      className={t.ok ? "text-approve-ink" : "text-discard"}
                    >
                      {t.ok
                        ? `Teste: ${t.count} notícias — “${t.titles[0] ?? ""}”`
                        : `Teste falhou: ${t.error ?? "nenhuma notícia lida"}`}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2 bg-surface-2 px-5 py-4">
          <span className="text-[13px] font-semibold">Adicionar feed</span>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto_auto]">
            <label htmlFor="new-name" className="sr-only">
              Nome da nova fonte
            </label>
            <input
              id="new-name"
              value={newName}
              maxLength={80}
              placeholder="Nome (ex.: Tecnoblog)"
              onChange={(e) => setNewName(e.target.value)}
              className={input}
            />
            <label htmlFor="new-url" className="sr-only">
              Endereço do novo feed
            </label>
            <input
              id="new-url"
              type="url"
              value={newUrl}
              maxLength={500}
              placeholder="https://site.com/feed"
              onChange={(e) => {
                setNewUrl(e.target.value);
                setTests((t) => {
                  const rest = { ...t };
                  delete rest["__new"];
                  return rest;
                });
              }}
              className={`${input} font-mono text-xs`}
            />
            <button
              type="button"
              disabled={!newUrl.trim() || newTest === "loading"}
              onClick={() => void test("__new", newUrl.trim(), newName.trim())}
              className={btn}
            >
              {newTest === "loading" ? "Testando…" : "Testar"}
            </button>
            <button
              type="button"
              disabled={!newName.trim() || !newUrl.trim()}
              onClick={addFeed}
              className={btn}
            >
              Adicionar à lista
            </button>
          </div>
          {newTest && newTest !== "loading" && (
            <p
              className={`m-0 text-xs ${newTest.ok ? "text-approve-ink" : "text-discard"}`}
            >
              {newTest.ok
                ? `${newTest.count} notícias encontradas. Mais recentes: ${newTest.titles.map((x) => `“${x}”`).join(" · ")}`
                : `Não consegui ler este feed: ${newTest.error ?? "nenhuma notícia"}.`}
            </p>
          )}
          <p className="m-0 text-xs text-muted">
            Depois de adicionar, pausar ou remover, clique em “Salvar fontes”.{" "}
            {statsNote}
            {apiNote ? ` ${apiNote}` : ""}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-muted">
          As palavras definem o nicho das buscas: só entram notícias com ao
          menos uma palavra do tema e nenhuma bloqueada.
        </p>
        <button
          type="button"
          disabled={!kwDirty || busy !== null}
          onClick={() => void save("keywords")}
          className={btnPrimary}
        >
          {busy === "keywords" ? "Salvando…" : "Salvar palavras"}
        </button>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <KeywordEditor
          id="kw-req"
          label="Palavras do tema"
          hint="A notícia precisa ter ao menos uma no título ou resumo."
          items={keywords.required}
          tone="neutral"
          onChange={(required) => setKeywords((k) => ({ ...k, required }))}
        />
        <KeywordEditor
          id="kw-block"
          label="Bloqueadas"
          hint="Qualquer ocorrência descarta a notícia."
          items={keywords.blocked}
          tone="discard"
          onChange={(blocked) => setKeywords((k) => ({ ...k, blocked }))}
        />
      </div>
      <Toast toast={toast} onClose={hide} />
    </>
  );
}
