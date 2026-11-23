"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { callApi } from "@/components/ui/client-api";
import { btnSecondary, Dialog } from "@/components/ui/dialog";

interface Result {
  result: { title: string; source: string; qualityScore: number | null };
}

/** "Gerar post a partir de um link" (UI-33, DEC-026). */
export function FromLinkButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Result["result"] | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
    setDone(null);
    setUrl("");
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await callApi<Result>("/api/drafts/from-link", {
        body: { url },
      });
      setDone(res.result);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-2 rounded-[10px] border border-line-field bg-surface px-4 text-sm font-medium text-ink"
      >
        Gerar post a partir de um link
      </button>
      <Dialog
        open={open}
        onClose={close}
        title="Gerar a partir de um link"
        description="Cole o endereço de uma matéria. O assistente lê o texto, escreve o carrossel em português creditando a fonte, e o rascunho entra na Revisão — nada é publicado sem a sua aprovação."
        footer={
          done ? (
            <>
              <button type="button" onClick={close} className={btnSecondary}>
                Fechar
              </button>
              <button
                type="button"
                onClick={() => router.push("/revisao")}
                className="h-11 rounded-[10px] border-0 bg-accent px-[18px] text-sm font-semibold text-white"
              >
                Ir para a Revisão
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className={btnSecondary}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || !url.trim()}
                onClick={() => void submit()}
                className="h-11 rounded-[10px] border-0 bg-ink px-[18px] text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Gerando… (pode levar 1 min)" : "Gerar rascunho"}
              </button>
            </>
          )
        }
      >
        {done ? (
          <p role="status" className="m-0 text-sm leading-normal">
            Rascunho criado: <strong>“{done.title}”</strong> ({done.source}
            {done.qualityScore !== null ? ` · nota ${done.qualityScore}` : ""}).
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="link-url" className="text-[13px] font-semibold">
              Link da matéria
            </label>
            <input
              id="link-url"
              type="url"
              inputMode="url"
              data-autofocus
              placeholder="https://…"
              value={url}
              disabled={busy}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim() && !busy) void submit();
              }}
              className="h-11 rounded-[10px] border border-line-field px-3 text-sm"
            />
            {error && (
              <p role="alert" className="m-0 text-sm text-discard">
                {error}
              </p>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
