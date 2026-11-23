// Guarda de URL para "gerar a partir de um link" (UI-33 / DEC-026). Puro.
// O servidor faz o fetch — só links públicos http(s) (proteção básica de SSRF).

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
];

export function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost"))
    return false;
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return !PRIVATE_V4.some((re) => re.test(host));
  }
  if (host.includes(":")) {
    // IPv6 literal: recusa loopback, link-local, ULA e mapeado de IPv4.
    return !/^(::1?|fe[89ab]|f[cd]|::ffff:)/.test(host);
  }
  return host.includes(".");
}

/** Nome da fonte a creditar: domínio sem "www." (ex.: "tecnoblog.net"). */
export function sourceNameFromUrl(raw: string): string {
  return new URL(raw).hostname.replace(/^www\./i, "");
}
