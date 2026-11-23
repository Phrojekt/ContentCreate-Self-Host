// Helper de chamadas às rotas internas a partir de Client Components.
// Só fala com rotas do próprio app (server-side) — nenhum segredo no cliente.

export async function callApi<T = unknown>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "POST",
    headers:
      init.body !== undefined
        ? { "content-type": "application/json" }
        : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? `Falha (HTTP ${res.status}).`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** Ignora atalhos de teclado quando o foco está num campo de texto. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}
