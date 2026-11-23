"use client";

import { useState } from "react";

/** Lista de chips que mostra os primeiros N e expande ("ver todos"). */
export function ChipList({
  items,
  initial = 12,
  tone = "neutral",
}: {
  items: string[];
  initial?: number;
  tone?: "neutral" | "discard";
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, initial);
  const cls =
    tone === "discard"
      ? "bg-discard-soft text-discard"
      : "bg-accent-soft text-accent-ink";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((k) => (
        <span
          key={k}
          className={`rounded-md px-2 py-[3px] font-mono text-xs ${cls}`}
        >
          {k}
        </span>
      ))}
      {items.length > initial && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="h-10 px-2 text-[13px] font-medium text-accent-ink"
        >
          {open ? "Mostrar menos" : `Ver todos (${items.length})`}
        </button>
      )}
    </div>
  );
}
