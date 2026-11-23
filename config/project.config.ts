// Edite SÓ este diretório (config/) + .env para um novo nicho.
// Não hardcode nada de nicho em src/.
//
// Parâmetros NÃO-secretos por nicho: tema, seleção, deduplicação.
// Segredos (chaves de API) vão para o .env, validados em src/lib/env.ts.
import type { RenderTheme, TemplateVariant } from "@/types/post";

// Nicho: Inteligência Artificial & Business Intelligence
export const projectConfig = {
  theme: {
    name: "IA & Dados",
    slug: "ia-dados",
    language: "pt-BR",

    // Tokens de design do template (Bloco 3). O LAYOUT é fixo e vive em `src/`;
    // só ESTAS cores/marca mudam por nicho. O template recebe `PostData` e
    // encaixa o conteúdo — separação conteúdo/layout (DEC-009).
    //
    // Identidade "terminal editorial de dados" (docs/brand-guide-carrossel.md
    // sec 2–3, DEC-015): fundo/superfície/texto FIXOS em todas as variantes —
    // só o accent muda por categoria. Fundo único = marca reconhecível antes
    // de ler o texto; a categoria se comunica pela cor de destaque.
    design: {
      fontFamily: "Inter",
      brand: "IA & Dados",
      colors: {
        background: "#0A0C12", // fundo de todo slide, todas as categorias
        surface: "#12151F", // painel/coluna em slides de comparação
        grid: "#1E2230", // hairlines (1px), divisores
        title: "#EDF1FA", // manchete, gancho, citação — "voz humana"
        muted: "#7C879E", // corpo secundário, legendas, fonte/data
        accent: "#7C8CFF", // índigo — IA geral (default)
        overlay: "rgba(10, 12, 18, 0.78)", // véu sobre imagem — igual em todas
      },
    } satisfies RenderTheme,
  },

  // Variantes de categoria (brand guide sec 3): mesma luminosidade/saturação
  // perceptual entre os 4 accents — nenhuma categoria "grita" mais que outra.
  // O accent aparece em rótulos, hairline de destaque, cantos de mira, número/
  // estatística e chips — NUNCA como fundo de área grande.
  templates: {
    // Índigo: IA geral.
    default: {
      fontFamily: "Inter",
      brand: "IA & Dados",
      colors: {
        background: "#0A0C12",
        surface: "#12151F",
        grid: "#1E2230",
        title: "#EDF1FA",
        muted: "#7C879E",
        accent: "#7C8CFF",
        overlay: "rgba(10, 12, 18, 0.78)",
      },
    },
    // Âmbar: lançamento/anúncio.
    breaking: {
      fontFamily: "Inter",
      brand: "IA & Dados",
      colors: {
        background: "#0A0C12",
        surface: "#12151F",
        grid: "#1E2230",
        title: "#EDF1FA",
        muted: "#7C879E",
        accent: "#FFB020",
        overlay: "rgba(10, 12, 18, 0.78)",
      },
    },
    // Teal: analytics/BI/pesquisa.
    data: {
      fontFamily: "Inter",
      brand: "IA & Dados",
      colors: {
        background: "#0A0C12",
        surface: "#12151F",
        grid: "#1E2230",
        title: "#EDF1FA",
        muted: "#7C879E",
        accent: "#2DD4BF",
        overlay: "rgba(10, 12, 18, 0.78)",
      },
    },
    // Esmeralda: mercado/empresas.
    business: {
      fontFamily: "Inter",
      brand: "IA & Dados",
      colors: {
        background: "#0A0C12",
        surface: "#12151F",
        grid: "#1E2230",
        title: "#EDF1FA",
        muted: "#7C879E",
        accent: "#34D399",
        overlay: "rgba(10, 12, 18, 0.78)",
      },
    },
  } satisfies Record<TemplateVariant, RenderTheme>,

  // Formato e estilo do post gerado (Bloco 3).
  //   - format: "square" (1080×1080) ou "portrait" (1080×1350).
  //   - carousel.enabled: divide o conteúdo em múltiplos slides (capa + corpo).
  //   - carousel.maxSlides: teto de slides incl. a capa (limite do Instagram: 10).
  //     No teto real do Instagram: o número de slides usados varia por post,
  //     proporcional ao tamanho do conteúdo da notícia (`content-target.ts`).
  post: {
    format: "portrait" as const,
    carousel: { enabled: true, maxSlides: 10 },
  },

  // Estimativa de custo por post (P3.4). Tarifas NÃO-secretas, ajustáveis aqui.
  //   - llm: USD por 1M de tokens, por provedor (chave = LlmProvider.id).
  //     * ollama: local, sem custo de API → 0.
  //     * anthropic: Claude Haiku 4.5 (modelo default) — US$1.00 in / US$5.00 out
  //       por 1M de tokens (jun/2026). Ajuste se trocar de modelo/tabela.
  //   - renderPerImage: Satori/resvg roda local (CPU) → 0.
  costs: {
    llm: {
      ollama: { inputPer1M: 0, outputPer1M: 0 },
      anthropic: { inputPer1M: 1.0, outputPer1M: 5.0 },
    },
    renderPerImage: 0,
  },

  // Redes sociais do perfil — usadas nos CTAs gerados pelo LLM.
  social: {
    instagramHandle: "@ia.e.dados",
  },

  // Coleta até 15 notícias por rodada; janela de 72h (3 dias) — o filtro de
  // já-processados (ProcessedUrl) é quem evita repetição, não a recência, então
  // a janela pode ser generosa sem risco de reprocessar o que já saiu.
  selection: { topN: 15, recencyHours: 72 },

  // Jaccard 0.82 (ligeiramente mais permissivo que 0.85): títulos de IA
  // costumam ter muitas palavras em comum (GPT, modelo, dados) sem serem
  // a mesma notícia.
  //
  // semantic: dedup por embeddings (pega a MESMA notícia de feeds diferentes,
  // com títulos distintos). enabled=false desliga (e não chama o Ollama).
  // threshold por cosseno (0.88 ~ "claramente a mesma história").
  dedup: {
    titleSimilarityThreshold: 0.82,
    semantic: { enabled: true, threshold: 0.88 },
  },

  // Memória de alinhamento via RAG (DEC-017/DEC-018/DEC-020). enabled=false
  // desliga o recall/gravação de memória (e não chama o Ollama para isso) —
  // o `AgenticRagProvider` ainda funciona só com feedback corretivo entre
  // tentativas (fail-safe). topK: quantas entradas recuperar na 1ª tentativa
  // (dobra a partir da 2ª — ver `agentic-rag-provider.ts`).
  memory: {
    enabled: true,
    topK: 4,
  },

  // Retenção (UI v2 — DEC-025 item 1): rascunhos descartados são excluídos de
  // vez após N dias (expurgo ao fim de cada rodada — UI-30). A lição gravada
  // na Memória sobrevive à exclusão.
  retention: {
    rejectedDays: 30,
  },
} as const;

export type ProjectConfig = typeof projectConfig;
