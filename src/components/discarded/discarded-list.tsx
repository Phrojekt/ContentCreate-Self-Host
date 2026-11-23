"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { btnDanger, btnSecondary, Dialog } from "@/components/ui/dialog";
import { callApi } from "@/components/ui/client-api";
import { Toast, useToast } from "@/components/ui/toast";

export interface DiscardedRow {
  id: string;
  title: string;
  note: string | null;
  /** Código do motivo ou "none". */
  reason: string;
  reasonLabel: string;
  source: string;
  when: string;
  whenTs: number;
  expiresIn: number;
}

export function DiscardedList({
  rows,
  retentionDays,
}: {
  rows: DiscardedRow[];
  retentionDays: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { toast, show, hide } = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const filters = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const r of rows) {
      const c = counts.get(r.reason) ?? { label: r.reasonLabel, count: 0 };
      c.count += 1;
      counts.set(r.reason, c);
    }
    return [
      { key: "all", label: "Todos", count: rows.length },
      ...[...counts.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([key, v]) => ({ key, ...v })),
    ];
  }, [rows]);

  const visible =
    filter === "all" ? rows : rows.filter((r) => r.reason === filter);
  const visibleSelected = visible.filter((r) => selected.has(r.id));
  const allChecked =
    visible.length > 0 && visibleSelected.length === visible.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) visible.forEach((r) => next.delete(r.id));
      else visible.forEach((r) => next.add(r.id));
      return next;
    });
  }

  async function bulk(action: "restore" | "delete", ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      // A rota aceita até 200 ids por chamada — "Esvaziar tudo" vai em lotes.
      let n = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const res = await callApi<{ count: number }>("/api/drafts/bulk", {
          body: { action, ids: ids.slice(i, i + 200) },
        });
        n += res.count ?? 0;
      }
      show({
        message:
          action === "restore"
            ? `${n} ${n === 1 ? "rascunho devolvido" : "rascunhos devolvidos"} à revisão.`
            : `${n} ${n === 1 ? "rascunho excluído" : "rascunhos excluídos"} de vez. As lições continuam na Memória.`,
      });
      setSelected(new Set());
      setConfirm(null);
      startTransition(() => router.refresh());
    } catch (err) {
      show({
        message: err instanceof Error ? err.message : "Falha na ação.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const selIds = visibleSelected.map((r) => r.id);

  return (
    <main className="px-5 pt-5 pb-10 md:px-10 md:pt-7 md:pb-12">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-[22px] font-bold tracking-[-0.02em] md:text-[26px]">
              Descartados
            </h1>
            <p className="m-0 max-w-[640px] text-sm leading-normal text-muted">
              Ficam aqui por {retentionDays} dias e depois são apagados
              sozinhos. O que o assistente aprendeu com eles continua na
              Memória, mesmo depois de excluídos.
            </p>
          </div>
          {visible.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirm(visible.map((r) => r.id))}
              className="h-10 rounded-[10px] border border-discard-line bg-surface px-3.5 text-sm font-semibold text-discard"
            >
              Esvaziar tudo ({visible.length})
            </button>
          )}
        </header>

        {rows.length > 0 && (
          <div
            role="group"
            aria-label="Filtrar por motivo"
            className="flex flex-wrap gap-2"
          >
            {filters.map((f) => {
              const on = f.key === filter;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(f.key)}
                  className={`h-10 rounded-full border px-3.5 text-sm ${
                    on
                      ? "border-accent bg-accent-soft font-semibold text-accent-ink"
                      : "border-line-field bg-surface font-medium text-ink"
                  }`}
                >
                  {f.label}{" "}
                  <span className="font-mono text-[11px] opacity-75">
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <section
          aria-label="Lista de descartados"
          className="overflow-hidden rounded-2xl border border-line bg-surface"
        >
          {visible.length > 0 && (
            <div
              className={`flex min-h-14 flex-wrap items-center gap-3 border-b border-line-soft px-5 py-2.5 ${
                selIds.length > 0 ? "bg-accent-soft" : ""
              }`}
            >
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="h-[18px] w-[18px] accent-accent"
                />
                <span>
                  {selIds.length > 0
                    ? `${selIds.length} selecionado${selIds.length === 1 ? "" : "s"}`
                    : "Selecionar todos"}
                </span>
              </label>
              {selIds.length > 0 && (
                <div className="ml-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void bulk("restore", selIds)}
                    className="h-10 rounded-[9px] border border-line-field bg-surface px-3.5 text-[13px] font-semibold text-ink disabled:opacity-50"
                  >
                    Devolver à revisão
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm(selIds)}
                    className="h-10 rounded-[9px] border-0 bg-discard px-3.5 text-[13px] font-semibold text-white disabled:opacity-60"
                  >
                    Excluir de vez
                  </button>
                </div>
              )}
            </div>
          )}

          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-14 text-center">
              <span className="text-base font-semibold">Nada por aqui</span>
              <span className="text-sm text-muted">
                Lixeira vazia. As lições continuam guardadas na Memória.
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[44px_minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_120px_100px] gap-3 border-b border-line-soft bg-surface-2 px-5 py-2.5 text-xs font-semibold text-muted">
                  <span />
                  <span>Rascunho</span>
                  <span>Motivo</span>
                  <span>Fonte</span>
                  <span>Descartado</span>
                  <span>Some em</span>
                </div>
                {visible.map((r) => (
                  <label
                    key={r.id}
                    className={`grid cursor-pointer grid-cols-[44px_minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_120px_100px] items-center gap-3 border-b border-line-soft px-5 py-3 last:border-b-0 ${
                      selected.has(r.id) ? "bg-accent-soft/50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label={`Selecionar ${r.title}`}
                      className="h-[18px] w-[18px] accent-accent"
                    />
                    <span className="flex min-w-0 flex-col gap-[3px]">
                      <span className="truncate text-sm font-medium text-ink">
                        {r.title}
                      </span>
                      {r.note && (
                        <span className="truncate text-xs text-muted">
                          “{r.note}”
                        </span>
                      )}
                    </span>
                    <span className="justify-self-start rounded-md bg-discard-soft px-2 py-[3px] text-xs font-semibold text-discard">
                      {r.reasonLabel}
                    </span>
                    <span className="text-[13px] text-ink-2">{r.source}</span>
                    <span className="text-[13px] text-ink-2">{r.when}</span>
                    <span
                      className={`text-[13px] ${
                        r.expiresIn <= 3
                          ? "font-semibold text-warn-ink"
                          : "text-ink-2"
                      }`}
                    >
                      {r.expiresIn === 0
                        ? "próxima rodada"
                        : `${r.expiresIn} ${r.expiresIn === 1 ? "dia" : "dias"}`}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={confirm !== null}
        role="alertdialog"
        maxWidth={460}
        onClose={() => setConfirm(null)}
        title={`Excluir ${confirm?.length ?? 0} de vez?`}
        description="Os rascunhos e as imagens somem e não dá para desfazer. As lições que eles geraram continuam ativas na Memória."
        footer={
          <>
            <button
              type="button"
              data-autofocus
              onClick={() => setConfirm(null)}
              className={btnSecondary}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => confirm && void bulk("delete", confirm)}
              className={btnDanger}
            >
              {busy ? "Excluindo…" : `Excluir ${confirm?.length ?? 0}`}
            </button>
          </>
        }
      />
      <Toast toast={toast} onClose={hide} />
    </main>
  );
}
