// Contratos do Bloco 3 (Geração de Design). O template recebe APENAS `PostData`
// — separação conteúdo/layout (DEC-009). Mudanças aqui afetam o renderer e o
// pacote final; devem ser deliberadas.

import type { SlideContent, SlideType } from "./draft";

/** Formato do post. Mapeado para dimensões em `src/constants/rendering.ts`. */
export type PostFormat = "square" | "portrait";

/** Identificador de variante de template (paleta + mood). */
/**
 * Identificador da categoria/variante do post (paleta + rótulo). Desde a
 * DEC-028 as categorias são configuráveis: além de "default", vale qualquer id
 * criado na Identidade. Os 4 de fábrica: default | breaking | data | business.
 */
export type TemplateVariant = string;

/**
 * Tokens de design que o template consome (vêm de `config/`, não de `src/`).
 * Brand guide (docs/brand-guide-carrossel.md sec 3): `background`, `surface`,
 * `grid`, `title` e `muted` são FIXOS entre variantes; só `accent` muda.
 */
export interface RenderTheme {
  fontFamily: string;
  brand: string;
  /** Rótulo da categoria no slide ("[ RÓTULO ]"). Ausente → rótulo de fábrica. */
  categoryLabel?: string;
  colors: {
    background: string;
    /** Painel/coluna em slides de comparação; nunca cobre o slide inteiro. */
    surface: string;
    /** Hairlines (linhas de 1px), divisores. */
    grid: string;
    title: string;
    muted: string;
    accent: string;
    overlay: string;
  };
}

/**
 * Tudo (e só) o que o template precisa para desenhar um slide.
 * Sem referência a notícia/Draft — o layout não conhece a origem do conteúdo.
 */
export interface PostData {
  /** Manchete curta (o template ajusta o corpo ao tamanho — robustez). */
  shortTitle: string;
  /** Nome da fonte a creditar (DEC-008). O template prefixa "Fonte:". */
  sourceCredit: string;
  /** Data já formatada para exibição (ex.: "17 de junho de 2026"). */
  date: string;
  /** Imagem de fundo opcional. Ausente/ruim → fundo sólido (layout não quebra). */
  backgroundImageUrl?: string;
  /**
   * Texto de corpo do slide (carrossel). Quando presente, o template desenha um
   * slide de CORPO (manchete vira chapéu pequeno, o `body` ocupa o centro); sem
   * `body` é um slide de CAPA. Ausente em post único → mantém o layout atual.
   */
  body?: string;
  /**
   * Gancho curto do slide de corpo, exibido em destaque acima do `body`. Dá
   * hierarquia e ritmo de leitura (evita o efeito "recorte"). Ausente → o slide
   * mostra só o parágrafo (layout não quebra).
   */
  lead?: string;
  /**
   * Posição no carrossel (1-based). Quando presente, o template mostra o
   * contador "i/total" e o "arraste →" nos slides que não são o último.
   */
  position?: { index: number; total: number };
  /**
   * Variante de template (paleta de cores). Determinada automaticamente pelo
   * conteúdo (tema-seletor) antes de renderizar. Ausente → "default".
   */
  variant?: TemplateVariant;
  /**
   * Primeira frase da legenda, usada como sub-manchete na capa. Ausente → só o
   * shortTitle é exibido (não quebra o layout).
   */
  teaser?: string;
  /**
   * Hashtags exibidas como chips no último slide do carrossel (ou post único).
   * No máximo 5 são renderizadas para evitar overflow.
   */
  hashtags?: string[];
  /**
   * Arquétipo do slide (brand guide sec 6). Ausente → inferido: sem `body` é
   * capa; com `body` é contexto. Rascunhos antigos continuam renderizando.
   */
  slideType?: SlideType;
  /** Rótulo Mono uppercase específico do slide — ex.: "O QUE ACONTECEU". */
  eyebrow?: string;
  /** Dados do arquétipo Estatística (número gigante + rótulo + apoio). */
  stat?: SlideContent["stat"];
  /** Dados do arquétipo Comparação (duas colunas antes/depois ou X vs Y). */
  comparison?: SlideContent["comparison"];
  /** Dados do arquétipo Citação (texto + nome + cargo reais da matéria). */
  quote?: SlideContent["quote"];
}

/** Imagem renderizada (saída do renderer). */
export interface PostImage {
  /** PNG já rasterizado. */
  buffer: Buffer;
  width: number;
  height: number;
  format: PostFormat;
}

/** Pacote final do Bloco 3: imagem(ns) + legenda + hashtags, pronto p/ revisão. */
export interface PostPackage {
  /** 1 imagem (post único) ou até 10 (carrossel). */
  images: PostImage[];
  caption: string;
  hashtags: string[];
  format: PostFormat;
}

export interface RenderOptions {
  format?: PostFormat;
}

/**
 * Fronteira de I/O da renderização (DEC-005). Implementações: `SatoriRenderer`
 * (Satori→SVG→PNG) agora; Playwright depois, se precisar de CSS completo.
 */
export interface PostRenderer {
  readonly id: string;
  render(data: PostData, options?: RenderOptions): Promise<PostImage>;
}
