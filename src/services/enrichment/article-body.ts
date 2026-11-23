/**
 * Extração do corpo do artigo a partir do HTML (função pura, testável sem rede).
 *
 * Estratégia, da mais confiável para a menos:
 *   1. JSON-LD `articleBody` (muitos portais embutem o texto integral).
 *   2. Concatenação dos <p> dentro de <article> (ou da página).
 *   3. <meta property="og:description"> como último recurso.
 *
 * O texto é insumo do LLM (resumo reescrito, DEC-008) — nunca republicado.
 */

const MIN_USEFUL_LENGTH = 400;

/** Remove tags e normaliza espaços de um trecho de HTML. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Procura recursivamente uma chave `articleBody` num objeto JSON-LD. */
function findArticleBody(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findArticleBody(child);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj["articleBody"] === "string" && obj["articleBody"].trim()) {
    return obj["articleBody"];
  }
  for (const value of Object.values(obj)) {
    const found = findArticleBody(value);
    if (found) return found;
  }
  return null;
}

function fromJsonLd(html: string): string | null {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  let best: string | null = null;
  for (const match of scripts) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const body = findArticleBody(JSON.parse(raw));
      if (body && (!best || body.length > best.length)) best = body;
    } catch {
      // JSON-LD malformado — ignora e tenta o próximo bloco.
    }
  }
  return best ? htmlToText(best) : null;
}

function fromParagraphs(html: string): string | null {
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const scope = articleMatch?.[1] ?? html;
  const paragraphs = [...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => htmlToText(m[1] ?? ""))
    .filter((t) => t.length > 40);
  if (paragraphs.length === 0) return null;
  return paragraphs.join("\n\n");
}

function fromMetaDescription(html: string): string | null {
  const m = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  );
  return m?.[1] ? htmlToText(m[1]) : null;
}

/**
 * Extrai o corpo do artigo do HTML. Retorna `null` se nada útil for encontrado
 * (ex.: página de redirect/JS sem conteúdo) — o chamador então mantém o resumo.
 */
export function extractArticleBody(html: string): string | null {
  const candidates = [
    fromJsonLd(html),
    fromParagraphs(html),
    fromMetaDescription(html),
  ];
  for (const text of candidates) {
    if (text && text.length >= MIN_USEFUL_LENGTH) return text;
  }
  // Nenhum candidato "robusto"; devolve o melhor não-vazio, se houver.
  return (
    candidates.find((t): t is string => Boolean(t && t.length > 0)) ?? null
  );
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string | null {
  const a = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
    "i",
  ).exec(html);
  const b = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
    "i",
  ).exec(html);
  const v = a?.[1] ?? b?.[1];
  return v ? decodeEntities(v) : null;
}

/**
 * Título e imagem da página (UI-33 / DEC-026): `og:title` → `twitter:title`
 * → `<title>`; `og:image`. Função pura.
 */
export function extractPageMeta(html: string): {
  title: string | null;
  imageUrl: string | null;
} {
  const tag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const title =
    metaContent(html, "og:title") ??
    metaContent(html, "twitter:title") ??
    (tag ? decodeEntities(tag.replace(/\s+/g, " ")) : null);
  const image = metaContent(html, "og:image");
  return {
    title: title || null,
    imageUrl: image && /^https?:\/\//i.test(image) ? image : null,
  };
}
