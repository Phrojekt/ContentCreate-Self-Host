// Piso de qualidade do verificador (`scoreOutput`) — UI-21. Um rascunho com
// nota abaixo disso NÃO passou no gate depois de todas as tentativas do
// AgenticRagProvider: é o corte do filtro "Nota baixa" da Revisão.
export const QUALITY_MIN_SCORE = 90;

/** Faixa "perto do piso" (neutra na UI): de MIN − 15 até MIN − 1. */
export const QUALITY_NEAR_MARGIN = 15;

export type QualityTone = "good" | "near" | "low";

export function qualityTone(score: number): QualityTone {
  if (score >= QUALITY_MIN_SCORE) return "good";
  if (score >= QUALITY_MIN_SCORE - QUALITY_NEAR_MARGIN) return "near";
  return "low";
}

/** Tentativas do AgenticRagProvider (gera → verifica → corrige) por notícia. */
export const AGENTIC_MAX_ATTEMPTS = 3;
