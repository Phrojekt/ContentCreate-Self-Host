"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastState {
  message: string;
  /** Ação opcional (ex.: "Desfazer"). */
  action?: { label: string; run: () => void };
  tone?: "default" | "error";
}

/** Estado de toast com auto-fechamento (6 s). */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((t: ToastState) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(t);
    timer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  const hide = useCallback(() => setToast(null), []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { toast, show, hide };
}

export function Toast({
  toast,
  onClose,
}: {
  toast: ToastState | null;
  onClose: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-7"
    >
      {toast && (
        <div
          className={`pointer-events-auto flex items-center gap-3.5 rounded-xl py-2.5 pr-2.5 pl-4 text-sm text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${
            toast.tone === "error" ? "bg-discard" : "bg-toast"
          }`}
        >
          <span>{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                onClose();
              }}
              className="h-10 rounded-lg bg-toast-2 px-3 text-[13px] font-semibold text-white"
            >
              {toast.action.label}
            </button>
          ) : (
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={onClose}
              className="h-10 w-10 rounded-lg text-white/80 hover:bg-toast-2"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
