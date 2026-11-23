"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { callApi } from "@/components/ui/client-api";
import { IconPlay } from "@/components/ui/icons";

interface RunResponse {
  ok: boolean;
  outcome: {
    ok: boolean;
    skipped?: boolean;
    error?: string;
    result?: { draftsCreated: number };
  };
}

/**
 * "Rodar esteira agora" (UI-22). A rota é síncrona e pode levar minutos:
 * o botão mostra "Rodando…", fica desabilitado e a navegação continua livre.
 */
export function RunPipelineButton({ running = false }: { running?: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await callApi<RunResponse>("/api/pipeline/run");
      const o = res.outcome;
      if (o.skipped) {
        setMessage("Já havia uma rodada em andamento — esta foi pulada.");
      } else if (!o.ok) {
        setMessage(`A rodada falhou: ${o.error ?? "erro desconhecido"}.`);
      } else {
        const n = o.result?.draftsCreated ?? 0;
        setMessage(
          n === 0
            ? "Rodada concluída — nenhuma notícia nova virou rascunho."
            : `Rodada concluída — ${n} ${n === 1 ? "rascunho novo" : "rascunhos novos"} na fila.`,
        );
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao rodar.");
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  const disabled = busy || running;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => void run()}
        disabled={disabled}
        aria-busy={busy}
        className="flex h-11 items-center gap-2 rounded-[10px] border-0 bg-ink px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        <IconPlay size={15} />
        {busy || running ? "Rodando…" : "Rodar esteira agora"}
      </button>
      <p role="status" aria-live="polite" className="m-0 text-xs text-muted">
        {message ??
          (busy
            ? "Pode levar alguns minutos. Você pode continuar navegando."
            : "")}
      </p>
    </div>
  );
}
