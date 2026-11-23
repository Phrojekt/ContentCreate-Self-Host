"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Diálogo modal acessível (sem lib): `role="dialog"`/`alertdialog`,
 * `aria-modal`, foco preso dentro, `Esc` fecha e o foco volta ao elemento que
 * abriu. Os atalhos de página checam `[aria-modal=true]` e ficam inertes.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  role = "dialog",
  maxWidth = 540,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  role?: "dialog" | "alertdialog";
  maxWidth?: number;
  children?: React.ReactNode;
  footer: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    (
      node?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0]
    )?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(23,24,28,0.42)] p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="flex max-h-full w-full flex-col gap-[18px] overflow-y-auto rounded-[18px] bg-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
        style={{ maxWidth }}
      >
        <div className="flex flex-col gap-1.5">
          <h2 id={titleId} className="m-0 text-[19px] font-bold">
            {title}
          </h2>
          {description && (
            <p id={descId} className="m-0 text-sm leading-normal text-muted">
              {description}
            </p>
          )}
        </div>
        {children}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

export const btnSecondary =
  "h-11 rounded-[10px] border border-line-field bg-surface px-4 text-sm font-medium text-ink disabled:opacity-50";
export const btnDanger =
  "h-11 rounded-[10px] border-0 bg-discard px-[18px] text-sm font-semibold text-white disabled:opacity-60";
