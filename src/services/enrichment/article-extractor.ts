import { logger } from "@/lib/logger";
import { extractArticleBody, extractPageMeta } from "./article-body";

/** Fronteira de I/O para ler o texto integral de um artigo (DEC-005). */
export interface ArticleExtractor {
  readonly id: string;
  /** Busca e extrai o corpo do artigo; `null` se não conseguir (fail-safe). */
  extract(url: string): Promise<string | null>;
}

/** Página lida por completo (UI-33): corpo + título/imagem dos metadados. */
export interface ExtractedPage {
  body: string | null;
  title: string | null;
  imageUrl: string | null;
}

export interface HttpArticleExtractorOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** Injetável para testes (default: fetch global). */
  fetchFn?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

/**
 * Extrator HTTP: baixa o HTML (UA de navegador, segue redirects, timeout e teto
 * de bytes) e extrai o corpo via `extractArticleBody`. Qualquer falha → `null`
 * (o pipeline mantém o resumo do RSS). Não republica nada (DEC-008).
 */
export class HttpArticleExtractor implements ArticleExtractor {
  readonly id = "http";

  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: HttpArticleExtractorOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async extract(url: string): Promise<string | null> {
    const html = await this.fetchHtml(url);
    return html === null ? null : extractArticleBody(html);
  }

  /** Corpo + título/imagem (gerar a partir de link — DEC-026). `null` se não leu. */
  async extractPage(url: string): Promise<ExtractedPage | null> {
    const html = await this.fetchHtml(url);
    if (html === null) return null;
    return { body: extractArticleBody(html), ...extractPageMeta(html) };
  }

  private async fetchHtml(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      });
      if (!res.ok) return null;

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) return null;

      const html = await res.text();
      if (html.length > this.maxBytes) return null;
      return html;
    } catch (err) {
      logger.debug(
        { url, err: err instanceof Error ? err.message : String(err) },
        "Extração de artigo falhou — mantendo resumo",
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
