/**
 * Estimativa de custo por post (P3.4) — função pura, sem rede nem env.
 *
 * Objetivo: dar visibilidade de quanto custa gerar um post. Com LLM local
 * (Ollama) o custo é ~0; o módulo ganha valor real ao trocar para um provedor
 * pago (Anthropic), mostrando o gasto de tokens por rodada.
 *
 * É uma ESTIMATIVA: os tokens são inferidos do tamanho do texto (~4 chars/token),
 * não dos contadores reais do provedor — evita acoplar a interface `LlmProvider`
 * a métricas de billing. Boa o suficiente para acompanhar ordem de grandeza.
 */

/** Tarifa de um provedor de LLM, em USD por 1 milhão de tokens. */
export interface LlmRate {
  inputPer1M: number;
  outputPer1M: number;
}

/** Tabela de tarifas (não-secreta; vive em `config/project.config.ts`). */
export interface CostRates {
  /** Tarifa por provedor (chave = `LlmProvider.id`, ex.: "ollama", "anthropic"). */
  llm: Record<string, LlmRate>;
  /** Custo por imagem renderizada (Satori/resvg local = 0). */
  renderPerImage: number;
}

/** Uso de um único post, em CHARS (convertidos em tokens internamente). */
export interface PostUsage {
  /** Id do provedor de LLM usado (casa com as chaves de `CostRates.llm`). */
  provider: string;
  /** Texto enviado ao LLM (prompt + artigo). */
  inputChars: number;
  /** Texto gerado pelo LLM (título + legenda + slides + hashtags). */
  outputChars: number;
  /** Quantidade de imagens a renderizar (capa + slides de corpo). */
  images: number;
}

/** Quebra de custo estimado de um post (ou de uma rodada agregada), em USD. */
export interface CostBreakdown {
  llmInputUsd: number;
  llmOutputUsd: number;
  renderUsd: number;
  totalUsd: number;
}

/**
 * Sobrecusto fixo do prompt (instruções, exemplos, formato JSON) somado ao texto
 * do artigo para estimar os tokens de entrada. Aproxima o tamanho do bloco de
 * instruções de `buildPrompt`.
 */
export const PROMPT_OVERHEAD_CHARS = 2200;

/** Heurística padrão: ~4 chars por token (PT/EN). Nunca negativo. */
export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

/** Arredonda para 6 casas — custos por post são minúsculos (frações de centavo). */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Estima o custo de UM post a partir do uso e da tabela de tarifas. */
export function estimatePostCost(
  usage: PostUsage,
  rates: CostRates,
): CostBreakdown {
  const rate = rates.llm[usage.provider] ?? { inputPer1M: 0, outputPer1M: 0 };
  const llmInputUsd =
    (estimateTokens(usage.inputChars) / 1_000_000) * rate.inputPer1M;
  const llmOutputUsd =
    (estimateTokens(usage.outputChars) / 1_000_000) * rate.outputPer1M;
  const renderUsd = Math.max(0, usage.images) * rates.renderPerImage;
  return {
    llmInputUsd: round(llmInputUsd),
    llmOutputUsd: round(llmOutputUsd),
    renderUsd: round(renderUsd),
    totalUsd: round(llmInputUsd + llmOutputUsd + renderUsd),
  };
}

/** Soma várias quebras de custo numa só (agrega o custo da rodada). */
export function sumCosts(breakdowns: CostBreakdown[]): CostBreakdown {
  const acc = breakdowns.reduce(
    (a, b) => ({
      llmInputUsd: a.llmInputUsd + b.llmInputUsd,
      llmOutputUsd: a.llmOutputUsd + b.llmOutputUsd,
      renderUsd: a.renderUsd + b.renderUsd,
      totalUsd: a.totalUsd + b.totalUsd,
    }),
    { llmInputUsd: 0, llmOutputUsd: 0, renderUsd: 0, totalUsd: 0 },
  );
  return {
    llmInputUsd: round(acc.llmInputUsd),
    llmOutputUsd: round(acc.llmOutputUsd),
    renderUsd: round(acc.renderUsd),
    totalUsd: round(acc.totalUsd),
  };
}
