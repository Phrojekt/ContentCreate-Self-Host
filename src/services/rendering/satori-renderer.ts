import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { projectConfig } from "@config/project.config";
import {
  DEFAULT_FORMAT,
  DIMENSIONS,
  IMAGE_FETCH_TIMEOUT_MS,
  IMAGE_MAX_BYTES,
} from "@/constants/rendering";
import { logger } from "@/lib/logger";
import type {
  PostData,
  PostImage,
  PostRenderer,
  RenderOptions,
  RenderTheme,
  TemplateVariant,
} from "@/types";
import { buildTemplate } from "./template";

type FetchFn = typeof fetch;

interface SatoriFont {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 600 | 700 | 800;
  style: "normal";
}

let fontCache: SatoriFont[] | null = null;

/**
 * Descobre o diretório das fontes de um pacote `@fontsource/*` funcionando
 * tanto no Node puro (tsx CLI) quanto no servidor Next.js. No Turbopack,
 * `import.meta.url`/`require.resolve` devolvem um caminho virtual com o
 * placeholder `[project]` que não existe no disco — por isso testamos
 * candidatos reais e usamos o primeiro que existir.
 */
function resolveFontsDir(pkg: string, probeFont: string): string {
  const candidates: string[] = [
    // Raiz do projeto — real em ambos os runtimes (CLI e Next rodam do root).
    join(process.cwd(), "node_modules", "@fontsource", pkg, "files"),
  ];
  try {
    const require = createRequire(import.meta.url);
    candidates.push(
      join(
        dirname(require.resolve(`@fontsource/${pkg}/package.json`)),
        "files",
      ),
    );
  } catch {
    // require.resolve pode falhar/retornar caminho virtual sob bundler — ignora.
  }
  const found = candidates.find((dir) => existsSync(join(dir, probeFont)));
  if (!found) {
    throw new Error(
      `Fontes ${pkg} não encontradas. Procurado em:\n${candidates.join("\n")}`,
    );
  }
  return found;
}

/**
 * Carrega as duas famílias do brand guide (sec 4): Inter para "voz humana"
 * (400 corpo/citação, 600 rótulo de estatística, 700 gancho, 800 manchete) e
 * JetBrains Mono para "dado/sistema" (500 rótulos, 700 contador/valores).
 * Satori aceita `.woff`.
 */
function loadFonts(): SatoriFont[] {
  if (fontCache) return fontCache;

  const interDir = resolveFontsDir("inter", "inter-latin-400-normal.woff");
  const monoDir = resolveFontsDir(
    "jetbrains-mono",
    "jetbrains-mono-latin-500-normal.woff",
  );

  const inter = (weight: SatoriFont["weight"]): SatoriFont => ({
    name: "Inter",
    data: readFileSync(join(interDir, `inter-latin-${weight}-normal.woff`)),
    weight,
    style: "normal",
  });
  const mono = (weight: SatoriFont["weight"]): SatoriFont => ({
    name: "JetBrains Mono",
    data: readFileSync(
      join(monoDir, `jetbrains-mono-latin-${weight}-normal.woff`),
    ),
    weight,
    style: "normal",
  });

  fontCache = [
    inter(400),
    inter(600),
    inter(700),
    inter(800),
    mono(500),
    mono(700),
  ];
  return fontCache;
}

export interface SatoriRendererOptions {
  /** Injetável para testes (default: `fetch` global). */
  fetchFn?: FetchFn;
  /** Timeout do prefetch da imagem de fundo (default 8s). */
  timeoutMs?: number;
  /** Mapa de temas por variante (injetável para testes). Default: config. */
  themes?: Partial<Record<TemplateVariant, RenderTheme>>;
}

/**
 * `PostRenderer` via Satori (template → SVG) + resvg (SVG → PNG) — DEC-009.
 *
 * Imports nativos (`satori`, `@resvg/resvg-js`) são dinâmicos para não carregar
 * binário em quem só importa a lógica pura do template. A imagem de fundo é
 * pré-buscada e embutida como data URI; qualquer falha cai para fundo sólido
 * (robustez — imagem ruim/ausente nunca quebra o layout).
 */
export class SatoriRenderer implements PostRenderer {
  readonly id = "satori";

  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;
  private readonly themes: Partial<Record<TemplateVariant, RenderTheme>>;

  constructor(options: SatoriRendererOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? IMAGE_FETCH_TIMEOUT_MS;
    this.themes = options.themes ?? projectConfig.templates;
  }

  private resolveTheme(variant: TemplateVariant | undefined): RenderTheme {
    const key = variant ?? "default";
    return (
      this.themes[key] ?? this.themes["default"] ?? projectConfig.theme.design
    );
  }

  async render(data: PostData, options?: RenderOptions): Promise<PostImage> {
    const format = options?.format ?? DEFAULT_FORMAT;
    const { width, height } = DIMENSIONS[format];

    const safeData = await this.resolveBackground(data);
    const theme = this.resolveTheme(data.variant);
    const tree = buildTemplate(safeData, format, theme);

    const { default: satori } = await import("satori");
    const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
      width,
      height,
      fonts: loadFonts(),
    });

    const { Resvg } = await import("@resvg/resvg-js");
    const png = new Resvg(svg, {
      fitTo: { mode: "width", value: width },
    })
      .render()
      .asPng();

    return { buffer: png, width, height, format };
  }

  /** Troca a URL da imagem por um data URI embutido; em falha, remove a imagem. */
  private async resolveBackground(data: PostData): Promise<PostData> {
    if (!data.backgroundImageUrl) return data;

    const dataUri = await this.fetchImageAsDataUri(data.backgroundImageUrl);
    if (dataUri) return { ...data, backgroundImageUrl: dataUri };

    logger.warn(
      { url: data.backgroundImageUrl },
      "Imagem de fundo indisponível — usando fundo sólido",
    );
    return {
      shortTitle: data.shortTitle,
      sourceCredit: data.sourceCredit,
      date: data.date,
    };
  }

  private async fetchImageAsDataUri(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(url, { signal: controller.signal });
      if (!res.ok) return null;

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) return null;

      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > IMAGE_MAX_BYTES) {
        return null;
      }
      return `data:${contentType};base64,${bytes.toString("base64")}`;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
