"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { callApi } from "@/components/ui/client-api";
import { Toast, useToast } from "@/components/ui/toast";

export interface MemoryCard {
  id: string;
  kind: "PROCEDURAL" | "EPISODIC";
  source: "MANUAL" | "FEEDBACK_APPROVED" | "FEEDBACK_REJECTED";
  content: string;
  category: string | null;
  active: boolean;
  when: string;
  /** Onde está hoje o rascunho de origem (null se não há ou foi excluído). */
  draftHref: string | null;
}

type Tab = "all" | MemoryCard["source"];

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Tudo" },
  { key: "MANUAL", label: "Regras suas" },
  { key: "FEEDBACK_APPROVED", label: "De aprovações" },
  { key: "FEEDBACK_REJECTED", label: "De descartes" },
];

const ORIGIN: Record<MemoryCard["source"], [string, string]> = {
  MANUAL: ["Regra sua", "bg-accent-soft text-accent-ink"],
  FEEDBACK_APPROVED: ["Exemplo aprovado", "bg-approve-soft text-approve-ink"],
  FEEDBACK_REJECTED: ["Lição de descarte", "bg-discard-soft text-discard"],
};

export function MemoryBoard({ cards }: { cards: MemoryCard[] }) {
  const { toast, show, hide } = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(cards.map((c) => [c.id, c.active])),
  );
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { MANUAL: 0, FEEDBACK_APPROVED: 0, FEEDBACK_REJECTED: 0 };
    for (const card of cards) c[card.source] += 1;
    return c;
  }, [cards]);
  const inactive = Object.values(active).filter((v) => !v).length;

  const q = query.trim().toLowerCase();
  const visible = cards.filter(
    (c) =>
      (tab === "all" || c.source === tab) &&
      (!q ||
        c.content.toLowerCase().includes(q) ||
        (c.category ?? "").toLowerCase().includes(q)),
  );

  async function toggle(card: MemoryCard) {
    const next = !active[card.id];
    setBusy(card.id);
    setActive((a) => ({ ...a, [card.id]: next })); // otimista
    try {
      await callApi(`/api/memory/${encodeURIComponent(card.id)}`, {
        method: "PATCH",
        body: { active: next },
      });
      show({
        message: next
          ? "Entrada reativada — volta a ser consultada."
          : "Entrada desativada — o assistente deixa de consultá-la. Nada foi apagado.",
      });
    } catch (err) {
      setActive((a) => ({ ...a, [card.id]: !next }));
      show({
        message: err instanceof Error ? err.message : "Falha ao salvar.",
        tone: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="px-5 pt-5 pb-10 md:px-10 md:pt-7 md:pb-12">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-5">
        <header className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] md:text-[26px]">
            Memória
          </h1>
          <p className="m-0 max-w-[720px] text-sm leading-normal text-muted">
            O que o assistente consulta antes de escrever cada rascunho: regras
            que você definiu e o que ele aprendeu com as suas aprovações e
            descartes. Desative o que não fizer mais sentido — nada é apagado.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [counts.MANUAL, "regras e exemplos-ouro seus"],
            [counts.FEEDBACK_APPROVED, "exemplos de posts aprovados"],
            [counts.FEEDBACK_REJECTED, "lições de descartes"],
            [inactive, "desativadas"],
          ].map(([n, label]) => (
            <div
              key={label}
              className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4"
            >
              <span className="font-mono text-[22px] font-semibold">{n}</span>
              <span className="text-[13px] text-muted">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Origem"
            className="flex flex-wrap rounded-[10px] bg-chip p-[3px]"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`h-[34px] rounded-lg px-3 text-[13px] ${
                  tab === t.key
                    ? "bg-surface font-semibold text-ink"
                    : "font-medium text-ink-2"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex w-full max-w-[320px] flex-col">
            <label htmlFor="msearch" className="sr-only">
              Buscar na memória
            </label>
            <input
              id="msearch"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar na memória"
              className="h-10 rounded-[10px] border border-line-field bg-surface px-3 text-sm"
            />
          </div>
        </div>

        <p className="m-0 text-xs text-muted">
          Regras manuais e exemplos-ouro vêm de{" "}
          <code className="font-mono">config/procedural-memory.ts</code> e{" "}
          <code className="font-mono">config/episodic-seed.ts</code> — para
          escrever uma regra nova, edite esses arquivos. Desligar aqui vale
          mesmo depois da próxima sincronização.
        </p>

        <section
          aria-label="Entradas da memória"
          className="flex flex-col gap-2.5"
        >
          {visible.length === 0 && (
            <p className="m-0 rounded-2xl border border-dashed border-line-field bg-surface p-8 text-center text-sm text-muted">
              Nada encontrado.
            </p>
          )}
          {visible.map((c) => {
            const on = active[c.id] ?? c.active;
            return (
              <article
                key={c.id}
                className={`flex gap-4 rounded-2xl border border-line bg-surface p-4 md:p-5 ${
                  on ? "" : "opacity-60"
                }`}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-md px-2 py-0.5 font-semibold ${ORIGIN[c.source][1]}`}
                    >
                      {ORIGIN[c.source][0]}
                    </span>
                    {c.category && (
                      <span className="rounded-md bg-line-soft px-2 py-0.5 font-mono text-ink-2">
                        {c.category}
                      </span>
                    )}
                    <span className="text-muted">
                      {c.kind === "PROCEDURAL" ? "regra" : "exemplo"} · {c.when}
                    </span>
                  </div>
                  <p className="m-0 line-clamp-4 text-sm leading-normal whitespace-pre-line text-ink">
                    {c.content}
                  </p>
                  {c.draftHref && (
                    <Link
                      href={c.draftHref}
                      className="text-[13px] font-medium"
                    >
                      Ver rascunho de origem
                    </Link>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? "Desativar" : "Ativar"}: ${c.content.slice(0, 60)}`}
                  disabled={busy === c.id}
                  onClick={() => void toggle(c)}
                  className="flex h-11 w-14 flex-none items-center justify-center self-start rounded-xl disabled:opacity-50"
                >
                  <span
                    aria-hidden="true"
                    className={`relative h-7 w-12 rounded-full transition-colors ${
                      on ? "bg-approve" : "bg-line-field"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
                        on ? "left-6" : "left-1"
                      }`}
                    />
                  </span>
                </button>
              </article>
            );
          })}
        </section>
      </div>
      <Toast toast={toast} onClose={hide} />
    </main>
  );
}
