import { DIMENSIONS } from "@/constants/rendering";
import type {
  PostData,
  PostFormat,
  RenderTheme,
  SlideType,
  TemplateVariant,
} from "@/types";

/**
 * Nó de layout no formato que o Satori consome (mesma forma de um elemento
 * React: `{ type, props }`). Mantemos como objeto puro para o template ser uma
 * função testável, sem JSX nem dependência de runtime de renderização.
 */
export interface TemplateNode {
  type: "div" | "img" | "span";
  props: {
    style: Record<string, unknown>;
    children?: TemplateNode[] | string;
    src?: string;
  };
}

export type { RenderTheme };

/** Rótulo de categoria exibido entre colchetes no header (brand guide sec 3). */
const VARIANT_LABEL: Partial<Record<TemplateVariant, string>> = {
  default: "IA",
  breaking: "LANÇAMENTO",
  data: "ANALYTICS",
  business: "NEGÓCIOS",
};

/** Família monoespaçada — tudo que é "dado/sistema" (brand guide sec 4). */
const MONO = "JetBrains Mono";

/** Zero-padding do contador de slides (`01/06`) e do índice na margem. */
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Normaliza espaços e trunca com reticências (robustez de layout). */
function clampText(value: string, max: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > max
    ? `${normalized.slice(0, max - 1).trimEnd()}…`
    : normalized;
}

/**
 * Ajusta a manchete ao espaço (robustez — o layout aguenta título de 4 ou de 40
 * palavras). Tamanho da fonte por faixa de comprimento; títulos absurdos são
 * truncados com reticências. Espaços em branco são normalizados.
 */
export function fitTitle(title: string): { text: string; fontSize: number } {
  const text = clampText(title, 200);

  let fontSize: number;
  if (text.length <= 36) fontSize = 84;
  else if (text.length <= 70) fontSize = 66;
  else if (text.length <= 120) fontSize = 52;
  else fontSize = 42;

  return { text, fontSize };
}

export interface FittedSlideText {
  leadText: string;
  leadSize: number;
  bodyText: string;
  bodySize: number;
}

/**
 * Ajusta o gancho (`lead`) + parágrafo (`body`) do slide de corpo ao espaço.
 * As duas fontes encolhem juntas conforme o texto cresce (o conjunto precisa
 * caber sem overflow); o gancho fica sempre maior que o parágrafo, dando
 * hierarquia. Textos absurdos são truncados com reticências (robustez).
 */
export function fitSlideText(lead: string, body: string): FittedSlideText {
  const leadText = clampText(lead, 70);
  const bodyText = clampText(body, 360);

  const combined = leadText.length + bodyText.length;
  let bodySize: number;
  if (combined <= 130) bodySize = 52;
  else if (combined <= 220) bodySize = 46;
  else if (combined <= 320) bodySize = 39;
  else bodySize = 33;

  return {
    leadText,
    leadSize: Math.round(bodySize * 1.28),
    bodyText,
    bodySize,
  };
}

/**
 * Ajusta o valor gigante do arquétipo Estatística (brand guide sec 6.3).
 * Mono 700, encolhe por comprimento; retrato tem mais altura → escala maior.
 */
export function fitStatValue(
  value: string,
  format: PostFormat,
): { text: string; fontSize: number } {
  const text = clampText(value, 16);
  const portrait = format === "portrait";

  let fontSize: number;
  if (text.length <= 4) fontSize = portrait ? 220 : 170;
  else if (text.length <= 7) fontSize = portrait ? 180 : 140;
  else if (text.length <= 11) fontSize = portrait ? 140 : 110;
  else fontSize = portrait ? 104 : 88;

  return { text, fontSize };
}

/**
 * Ajusta o texto do arquétipo Citação (brand guide sec 6.5) por comprimento.
 */
export function fitQuoteText(text: string): { text: string; fontSize: number } {
  const clamped = clampText(text, 360);

  let fontSize: number;
  if (clamped.length <= 120) fontSize = 56;
  else if (clamped.length <= 200) fontSize = 50;
  else if (clamped.length <= 300) fontSize = 44;
  else fontSize = 40;

  return { text: clamped, fontSize };
}

/**
 * Tamanho dos valores das duas colunas da Comparação (brand guide sec 6.4) —
 * o MAIOR dos dois manda (colunas simétricas, mesma escala nos dois lados).
 */
export function fitComparisonValueSize(left: string, right: string): number {
  const len = Math.max(clampText(left, 40).length, clampText(right, 40).length);
  if (len <= 8) return 96;
  if (len <= 14) return 72;
  if (len <= 22) return 52;
  return 40;
}

/** Atalho para nós span com texto. */
function text(children: string, style: Record<string, unknown>): TemplateNode {
  return { type: "span", props: { style, children } };
}

/** Atalho para nós div (Satori exige display:flex em containers). */
function box(
  style: Record<string, unknown>,
  children?: TemplateNode[],
): TemplateNode {
  return {
    type: "div",
    props: {
      style: { display: "flex", ...style },
      ...(children ? { children } : {}),
    },
  };
}

/** Estilo compartilhado do eyebrow (rótulo Mono uppercase de cada slide). */
function eyebrowStyle(colors: RenderTheme["colors"]): Record<string, unknown> {
  return {
    fontFamily: MONO,
    fontSize: 22,
    fontWeight: 500,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.muted,
  };
}

/**
 * Resolve o arquétipo efetivo do slide. `slideType` explícito vale, mas com
 * salvaguarda: arquétipos que exigem dados dedicados (stat/comparison/quote)
 * caem para "context" quando o campo não veio — layout nunca quebra por dado
 * faltando. Sem `slideType` (rascunhos antigos): com `body` é contexto, sem
 * `body` é capa — o comportamento anterior.
 */
function resolveArchetype(data: PostData): SlideType {
  const declared = data.slideType;
  if (declared === "stat" && data.stat) return "stat";
  if (declared === "comparison" && data.comparison) return "comparison";
  if (declared === "quote" && data.quote) return "quote";
  if (declared === "cover") return "cover";
  if (declared === "closing") return "closing";
  return data.body ? "context" : "cover";
}

/**
 * Monta a árvore de layout do slide a partir de `PostData` + tema (função pura).
 *
 * Identidade "terminal editorial de dados" (docs/brand-guide-carrossel.md,
 * DEC-015/DEC-016; preview em docs/carrossel-visual-preview.dc.html):
 *
 * - Anatomia comum (sec 5): cantos de mira em accent nos cantos superior-
 *   esquerdo e inferior-direito; hairline superior com traço accent; header
 *   com marca + `[ CATEGORIA ]` em Mono e contador `01/06`; rodapé com
 *   `FONTE — X` + data em Mono; `ARRASTAR →` nos slides que não são o último.
 * - 6 arquétipos (sec 6): capa, contexto, estatística, comparação, citação e
 *   fechamento — cada um com layout próprio, escolhido por `slideType`.
 * - Tipografia dupla (sec 4): Inter para "voz humana" (manchete, gancho,
 *   corpo, citação), JetBrains Mono para "dado/sistema" (rótulos, contador,
 *   números, fonte/data, hashtags).
 * - Robustez: todo texto passa por fit/clamp (título de 4 ou 40 palavras não
 *   quebra); imagem de fundo ausente/ruim → fundo sólido; arquétipo sem os
 *   dados dedicados → cai para contexto.
 */
export function buildTemplate(
  data: PostData,
  format: PostFormat,
  theme: RenderTheme,
): TemplateNode {
  const { width, height } = DIMENSIONS[format];
  const { colors } = theme;
  const hasImage = Boolean(data.backgroundImageUrl);
  const position = data.position;
  const isLast = position ? position.index >= position.total : true;
  const variantKey = (data.variant ?? "default") as TemplateVariant;
  const categoryLabel =
    theme.categoryLabel ?? VARIANT_LABEL[variantKey] ?? "IA";
  const archetype = resolveArchetype(data);
  const topGap = format === "portrait" ? 90 : 56;

  // ---------------------------------------------------------------- camadas
  const layers: TemplateNode[] = [];

  if (hasImage) {
    layers.push({
      type: "img",
      props: {
        src: data.backgroundImageUrl,
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          objectFit: "cover",
        },
      },
    });
    layers.push(
      box({
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        backgroundColor: colors.overlay,
      }),
    );
  }

  // Cantos de mira (sec 5.1) — vocabulário de instrumento de precisão, no
  // lugar dos anéis decorativos genéricos. Sempre acima da imagem/véu.
  layers.push(
    box({
      position: "absolute",
      top: 40,
      left: 40,
      width: 20,
      height: 20,
      borderTop: `2px solid ${colors.accent}`,
      borderLeft: `2px solid ${colors.accent}`,
    }),
    box({
      position: "absolute",
      bottom: 40,
      right: 40,
      width: 20,
      height: 20,
      borderBottom: `2px solid ${colors.accent}`,
      borderRight: `2px solid ${colors.accent}`,
    }),
    // Hairline superior (sec 5.2) + traço curto accent alinhado à esquerda.
    box({
      position: "absolute",
      top: 64,
      left: 0,
      width,
      height: 1,
      backgroundColor: colors.grid,
    }),
    box({
      position: "absolute",
      top: 60,
      left: 80,
      width: 48,
      height: 3,
      backgroundColor: colors.accent,
    }),
  );

  // ----------------------------------------------------------------- header
  const brandGroup = box({ flexDirection: "column", gap: 14 }, [
    text(theme.brand, {
      fontFamily: MONO,
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: 5,
      textTransform: "uppercase",
      color: colors.muted,
    }),
    text(`[ ${categoryLabel} ]`, {
      fontFamily: MONO,
      fontSize: 22,
      fontWeight: 500,
      letterSpacing: 2,
      color: colors.accent,
    }),
  ]);

  const headerChildren: TemplateNode[] = [brandGroup];
  if (position) {
    headerChildren.push(
      text(`${pad2(position.index)}/${pad2(position.total)}`, {
        fontFamily: MONO,
        fontSize: 26,
        fontWeight: 700,
        color: colors.muted,
      }),
    );
  }

  const header = box(
    { alignItems: "flex-start", justifyContent: "space-between" },
    headerChildren,
  );

  // ------------------------------------------------------------------ miolo
  // `fill: true` → o miolo ocupa o espaço restante e centraliza (stat, quote,
  // comparison). `fill: false` → ancorado logo abaixo do header, com um spacer
  // empurrando o rodapé (cover, context, closing) — padrão editorial.
  let middle: TemplateNode;
  let fill = false;

  if (archetype === "stat" && data.stat) {
    const { text: valueText, fontSize: valueSize } = fitStatValue(
      data.stat.value,
      format,
    );
    const support = data.stat.supporting?.trim()
      ? data.stat.supporting
      : (data.body ?? "");

    const children: TemplateNode[] = [
      text(clampText(data.eyebrow ?? "O NÚMERO", 40), eyebrowStyle(colors)),
      text(valueText, {
        fontFamily: MONO,
        fontSize: valueSize,
        fontWeight: 700,
        lineHeight: 1,
        color: colors.accent,
      }),
      text(clampText(data.stat.label, 110), {
        fontSize: 36,
        fontWeight: 600,
        lineHeight: 1.25,
        color: colors.title,
        maxWidth: width - 320,
      }),
    ];
    if (support.trim()) {
      children.push(
        text(clampText(support, 220), {
          fontSize: 26,
          fontWeight: 400,
          lineHeight: 1.45,
          color: colors.muted,
          maxWidth: width - 280,
        }),
      );
    }

    fill = true;
    middle = box(
      { flexDirection: "column", flex: 1, justifyContent: "center", gap: 20 },
      children,
    );
  } else if (archetype === "comparison" && data.comparison) {
    const cmp = data.comparison;
    const valueSize = fitComparisonValueSize(cmp.leftValue, cmp.rightValue);

    const column = (
      label: string,
      value: string,
      detail: string | undefined,
      accentSide: boolean,
      side: "left" | "right",
    ): TemplateNode => {
      const children: TemplateNode[] = [
        text(clampText(label, 26), {
          fontFamily: MONO,
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: accentSide ? colors.accent : colors.muted,
        }),
        text(clampText(value, 40), {
          fontFamily: MONO,
          fontSize: valueSize,
          fontWeight: 700,
          lineHeight: 1.05,
          color: accentSide ? colors.accent : colors.title,
        }),
      ];
      if (detail?.trim()) {
        children.push(
          text(clampText(detail, 110), {
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.4,
            color: colors.muted,
          }),
        );
      }
      return box(
        {
          flexDirection: "column",
          flex: 1,
          gap: 16,
          ...(side === "left" ? { paddingRight: 50 } : { paddingLeft: 50 }),
        },
        children,
      );
    };

    fill = true;
    middle = box({ flexDirection: "column", flex: 1 }, [
      text(clampText(data.eyebrow ?? "COMPARAÇÃO", 40), {
        ...eyebrowStyle(colors),
        marginTop: topGap,
      }),
      box({ flex: 1, alignItems: "center", marginTop: 20 }, [
        column(cmp.leftLabel, cmp.leftValue, cmp.leftDetail, false, "left"),
        box({ width: 1, alignSelf: "stretch", backgroundColor: colors.grid }),
        column(cmp.rightLabel, cmp.rightValue, cmp.rightDetail, true, "right"),
      ]),
    ]);
  } else if (archetype === "quote" && data.quote) {
    const { text: quoteText, fontSize: quoteSize } = fitQuoteText(
      data.quote.text,
    );

    fill = true;
    middle = box(
      { flexDirection: "column", flex: 1, justifyContent: "center", gap: 12 },
      [
        text("“", {
          fontSize: 140,
          fontWeight: 800,
          lineHeight: 1,
          color: colors.accent,
          opacity: 0.9,
        }),
        text(quoteText, {
          fontSize: quoteSize,
          fontWeight: 400,
          lineHeight: 1.35,
          color: colors.title,
          maxWidth: width - 200,
        }),
        box({
          width: 48,
          height: 2,
          backgroundColor: colors.grid,
          marginTop: 32,
          marginBottom: 20,
        }),
        text(clampText(data.quote.author, 48), {
          fontFamily: MONO,
          fontSize: 26,
          fontWeight: 700,
          textTransform: "uppercase",
          color: colors.title,
        }),
        text(clampText(data.quote.role, 80), {
          fontSize: 24,
          fontWeight: 400,
          color: colors.muted,
        }),
      ],
    );
  } else if (archetype === "context" || archetype === "closing") {
    const { leadText, leadSize, bodyText, bodySize } = fitSlideText(
      data.lead ?? "",
      data.body ?? "",
    );

    const textChildren: TemplateNode[] = [];
    const eyebrow =
      data.eyebrow ?? (archetype === "closing" ? "RESUMO" : undefined);
    if (eyebrow?.trim()) {
      textChildren.push(text(clampText(eyebrow, 40), eyebrowStyle(colors)));
    }
    if (leadText) {
      textChildren.push(
        text(leadText, {
          fontSize: leadSize,
          fontWeight: 700,
          lineHeight: 1.2,
          color: colors.title,
        }),
      );
    }
    textChildren.push(
      text(bodyText, {
        fontSize: bodySize,
        fontWeight: 400,
        lineHeight: 1.5,
        color: leadText ? colors.muted : colors.title,
      }),
    );

    const textColumn = box(
      { flexDirection: "column", gap: 24, flex: 1 },
      textChildren,
    );

    // Índice na margem esquerda (sec 6.2): marca pequena em Mono sobre uma
    // régua vertical — substitui o número gigante translúcido do layout velho.
    // O fechamento não leva a régua (é a síntese, não um passo da sequência).
    const rowChildren: TemplateNode[] = [];
    if (archetype === "context" && position) {
      rowChildren.push(
        box({ flexDirection: "column", width: 46, flexShrink: 0, gap: 12 }, [
          text(pad2(position.index), {
            fontFamily: MONO,
            fontSize: 22,
            fontWeight: 500,
            color: colors.accent,
          }),
          box({ width: 2, flex: 1, backgroundColor: colors.grid }),
        ]),
      );
    }
    rowChildren.push(textColumn);

    middle = box({ gap: 28, maxWidth: width - 160 }, rowChildren);
  } else {
    // Capa (sec 6.1): manchete Inter 800 + teaser (a implicação, 1 frase).
    const { text: titleText, fontSize: titleSize } = fitTitle(data.shortTitle);
    const coverChildren: TemplateNode[] = [
      text(titleText, {
        fontSize: titleSize,
        fontWeight: 800,
        lineHeight: 1.12,
        color: colors.title,
      }),
    ];

    if (data.teaser && data.teaser.length > 30) {
      coverChildren.push(
        box({
          width: 64,
          height: 3,
          backgroundColor: colors.accent,
          marginTop: 32,
          marginBottom: 24,
          opacity: 0.8,
        }),
        text(clampText(data.teaser, 200), {
          fontSize: 32,
          fontWeight: 400,
          lineHeight: 1.5,
          color: colors.muted,
        }),
      );
    }

    middle = box(
      { flexDirection: "column", maxWidth: width - 160 },
      coverChildren,
    );
  }

  // ----------------------------------------------------------------- rodapé
  const footerChildren: TemplateNode[] = [];

  // `ARRASTAR »` (sec 5.4) nos slides que não são o último. Guillemet no lugar
  // da seta U+2192 do preview: o glifo → não existe no subset latino das fontes
  // e renderizaria tofu, quebrando a marca de precisão.
  if (position && !isLast) {
    footerChildren.push(
      box({ justifyContent: "flex-end", marginBottom: 20 }, [
        text("ARRASTAR »", {
          fontFamily: MONO,
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: 2,
          color: colors.accent,
        }),
      ]),
    );
  }

  // Chips de hashtag (sec 5.5) — só no último slide, contorno accent sem
  // preenchimento: lê como "tag de sistema", não pílula genérica.
  const visibleHashtags = (data.hashtags ?? [])
    .slice(0, 5)
    .map((h) => (h.startsWith("#") ? h : `#${h}`));
  if (isLast && visibleHashtags.length > 0) {
    footerChildren.push(
      box(
        { flexWrap: "wrap", gap: 12, marginBottom: 24 },
        visibleHashtags.map((tag) =>
          box(
            {
              border: `1px solid ${colors.accent}`,
              borderRadius: 4,
              paddingTop: 6,
              paddingBottom: 6,
              paddingLeft: 16,
              paddingRight: 16,
            },
            [
              text(tag, {
                fontFamily: MONO,
                fontSize: 22,
                fontWeight: 500,
                color: colors.accent,
              }),
            ],
          ),
        ),
      ),
    );
  }

  footerChildren.push(
    box({ height: 1, backgroundColor: colors.grid, marginBottom: 20 }),
    box({ justifyContent: "space-between" }, [
      text(`FONTE — ${data.sourceCredit}`, {
        fontFamily: MONO,
        fontSize: 22,
        fontWeight: 500,
        textTransform: "uppercase",
        color: colors.muted,
      }),
      text(data.date, {
        fontFamily: MONO,
        fontSize: 22,
        fontWeight: 500,
        textTransform: "uppercase",
        color: colors.muted,
      }),
    ]),
  );

  const footer = box({ flexDirection: "column" }, footerChildren);

  // --------------------------------------------------------------- conteúdo
  const contentChildren: TemplateNode[] = fill
    ? [header, middle, footer]
    : [
        header,
        box({ flexDirection: "column", marginTop: topGap }, [middle]),
        box({ flex: 1 }),
        footer,
      ];

  const content = box(
    {
      position: "relative",
      flexDirection: "column",
      flex: 1,
      paddingTop: 100,
      paddingLeft: 80,
      paddingRight: 80,
      paddingBottom: 70,
    },
    contentChildren,
  );

  return box(
    {
      position: "relative",
      flexDirection: "column",
      width,
      height,
      backgroundColor: colors.background,
      fontFamily: theme.fontFamily,
      color: colors.title,
    },
    [...layers, content],
  );
}
