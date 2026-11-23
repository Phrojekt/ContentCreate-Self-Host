"use client";

import { useState } from "react";

import { btnDanger, btnSecondary, Dialog } from "@/components/ui/dialog";
import {
  REJECTION_NOTE_MAX,
  REJECTION_REASONS,
  type RejectionReason,
} from "@/constants/rejection";

export interface RejectChoice {
  reason?: RejectionReason;
  note?: string;
  learn: boolean;
}

/** "Por que descartar?" — motivo em chips, nota opcional, ensinar (UI-10). */
export function RejectDialog({
  open,
  title,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (choice: RejectChoice) => void;
}) {
  const [reason, setReason] = useState<RejectionReason | undefined>();
  const [note, setNote] = useState("");
  const [learn, setLearn] = useState(true);
  const [wasOpen, setWasOpen] = useState(open);

  // Reabriu → começa limpo.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason(undefined);
      setNote("");
      setLearn(true);
    }
  }

  const noLesson = reason === "design";

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Por que descartar?"
      description={
        <>
          “{title}”. Um clique basta — o motivo vira uma lição para os próximos
          rascunhos.
        </>
      }
      footer={
        <>
          <button type="button" onClick={onCancel} className={btnSecondary}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onConfirm({
                ...(reason ? { reason } : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
                learn,
              })
            }
            className={btnDanger}
          >
            {busy ? "Descartando…" : "Descartar rascunho"}
          </button>
        </>
      }
    >
      <div role="group" aria-label="Motivo" className="flex flex-wrap gap-2">
        {REJECTION_REASONS.map((r, i) => {
          const on = reason === r.code;
          return (
            <button
              key={r.code}
              type="button"
              aria-pressed={on}
              data-autofocus={i === 0 ? true : undefined}
              onClick={() => setReason(on ? undefined : r.code)}
              className={`h-10 rounded-full border px-3.5 text-sm ${
                on
                  ? "border-accent bg-accent-soft font-semibold text-accent-ink"
                  : "border-line-field bg-surface font-medium text-ink"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="rej-note" className="text-[13px] font-semibold">
          Detalhe <span className="font-normal text-muted">(opcional)</span>
        </label>
        <textarea
          id="rej-note"
          rows={2}
          maxLength={REJECTION_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex.: a notícia é só um anúncio de evento, sem novidade real."
          className="resize-y rounded-[10px] border border-line-field px-3 py-2.5 text-sm text-ink"
        />
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-[1.45]">
        <input
          type="checkbox"
          checked={learn && !noLesson}
          disabled={noLesson}
          onChange={(e) => setLearn(e.target.checked)}
          className="mt-px h-[18px] w-[18px] accent-accent"
        />
        <span>
          Ensinar o assistente{" "}
          <span className="text-muted">
            {noLesson
              ? "— design quebrado é problema de template, não vira lição de conteúdo."
              : "— grava como lição na Memória. Você pode desativar depois."}
          </span>
        </span>
      </label>
    </Dialog>
  );
}
