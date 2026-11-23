// Normalização de URL — função pura, base da deduplicação por URL canônica (DEC-006).
// Sem rede, sem estado: recebe string e devolve string.

// Parâmetros de rastreamento que não mudam o recurso e devem ser removidos.
const TRACKING_PARAM_PREFIXES = ["utm_"] as const;
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
  "ref_src",
  "spm",
  "cmpid",
  "xtor",
]);

/**
 * Canonicaliza uma URL para comparação estável:
 * minúscula no host, remove `www.`, fragmento (`#...`), parâmetros de
 * rastreamento, barra final e ordena a query. Se a URL for inválida, devolve
 * a original aparada (melhor esforço).
 */
export function canonicalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  url.hash = "";

  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
  }

  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      continue;
    }
    if (TRACKING_PARAMS.has(lower)) continue;
    kept.append(key, value);
  }
  kept.sort();
  url.search = kept.toString();

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}
