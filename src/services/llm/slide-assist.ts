// Ajuste de UM slide com o assistente (UI-34). Prompt e parse puros; a chamada
// ao modelo fica atrás de `JsonCompleter` (Ollama/Anthropic). A sugestão NÃO é
// gravada: o humano decide usar e salvar no editor (DEC-011).

import { parseSlideContentArray } from "@/lib/slide-content";
import type { SlideContent } from "@/types";

import { looksLikeEnglish } from "./language-check";
import { copyOverlapRatio } from "./originality-check";
import { sanitizeSlides } from "./sanitize";

/** Capacidade mínima de "mande um prompt, receba JSON em texto". */
export interface JsonCompleter {
  readonly id: string;
  completeJson(prompt: string): Promise<string>;
}

export const SLIDE_ASSIST_INSTRUCTIONS = {
  shorter:
    "Deixe o slide MAIS CURTO: corte pela metade sem perder o fato central.",
  direct:
    "Deixe o slide MAIS DIRETO: frase de abertura com o fato, sem rodeios nem adjetivos.",
  number:
    'Transforme em slide de NÚMERO (slideType "stat"): destaque UM número que aparece LITERALMENTE no texto de referência. Se não houver número no texto, mantenha o tipo atual e só deixe o texto mais concreto.',
  rewrite:
    "REESCREVA o slide com palavras e estrutura novas, mantendo exatamente os mesmos fatos.",
} as const;

export type SlideAssistInstruction = keyof typeof SLIDE_ASSIST_INSTRUCTIONS;

export interface SlideAssistContext {
  title: string;
  source: string;
  /** Texto de referência (resumo da notícia + legenda) — os fatos permitidos. */
  reference: string;
  /** Tema e rede do perfil (DEC-027). */
  niche?: string;
  networkLabel?: string;
}

/** Prompt restrito a um slide, com as regras R0–R2 do projeto. */
export function buildSlideAssistPrompt(
  slide: SlideContent,
  instruction: SlideAssistInstruction,
  ctx: SlideAssistContext,
): string {
  return `Você edita UM slide de um carrossel de ${ctx.networkLabel ?? "Instagram"} sobre ${ctx.niche ?? "IA e dados"}, em português do Brasil.

TAREFA: ${SLIDE_ASSIST_INSTRUCTIONS[instruction]}

REGRAS (obrigatórias):
R0. Todo o texto em português do Brasil — nenhuma palavra em inglês sem tradução.
R1. Zero invenção: todo número, nome ou resultado precisa aparecer no TEXTO DE REFERÊNCIA ou no SLIDE ATUAL. Sem dado = sem número.
R2. Não copie frases da referência: escreva com construção própria.
Mantenha o tom sóbrio, sem hype. Não mencione que é uma edição.

NOTÍCIA: "${ctx.title}" (fonte: ${ctx.source})
TEXTO DE REFERÊNCIA:
"""
${ctx.reference.slice(0, 2500)}
"""

SLIDE ATUAL (JSON):
${JSON.stringify(slide)}

Responda SÓ com um objeto JSON no mesmo formato do slide atual:
{"slideType": "...", "eyebrow": "...", "lead": "gancho curto", "body": "parágrafo", "stat": {"value": "...", "label": "..."} (só se slideType for "stat")}`;
}

/** Extrai o primeiro objeto JSON do texto do modelo. */
function firstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export interface SlideAssistResult {
  slide: SlideContent;
  /** Avisos não bloqueantes (o humano decide). */
  warnings: string[];
}

export class SlideAssistError extends Error {}

/**
 * Valida a resposta do modelo com as mesmas garantias da geração normal
 * (`parseSlideContentArray` + `sanitizeSlides`) e as travas R0/R1/R2 aplicáveis
 * a um slide. Lança `SlideAssistError` quando a sugestão não pode ser usada.
 */
export function parseSlideAssist(
  text: string,
  original: SlideContent,
  reference: string,
): SlideAssistResult {
  const [parsed] = sanitizeSlides(
    parseSlideContentArray([firstJsonObject(text)]),
  );
  if (!parsed) {
    throw new SlideAssistError(
      "O assistente não devolveu um slide aproveitável.",
    );
  }
  const slide: SlideContent = {
    ...parsed,
    slideType: parsed.slideType ?? original.slideType ?? "context",
  };
  // stat sem número válido → volta ao tipo original (layout não quebra).
  if (slide.slideType === "stat" && !slide.stat?.value?.trim()) {
    slide.slideType =
      original.slideType === "stat"
        ? "context"
        : (original.slideType ?? "context");
    delete slide.stat;
  }
  // Arquétipos com dados próprios que o modelo não devolveu: preserva os originais.
  if (
    slide.slideType === "comparison" &&
    !slide.comparison &&
    original.comparison
  ) {
    slide.comparison = original.comparison;
  }
  if (slide.slideType === "quote" && !slide.quote && original.quote) {
    slide.quote = original.quote;
  }
  if (
    (slide.slideType === "comparison" && !slide.comparison) ||
    (slide.slideType === "quote" && !slide.quote)
  ) {
    slide.slideType = "context";
  }

  const allText = `${slide.lead} ${slide.body}`;
  if (looksLikeEnglish(allText)) {
    throw new SlideAssistError(
      "A sugestão saiu em inglês (R0) — tente de novo.",
    );
  }

  const known = `${reference} ${original.lead} ${original.body} ${original.stat?.value ?? ""}`;
  if (slide.stat?.value) {
    const digits = slide.stat.value.match(/\d+(?:[.,]\d+)?/g) ?? [];
    const invented = digits.filter((d) => !known.includes(d));
    if (digits.length === 0 || invented.length > 0) {
      throw new SlideAssistError(
        `O número "${slide.stat.value}" não aparece no texto da matéria (R1) — sugestão descartada.`,
      );
    }
  }

  const warnings: string[] = [];
  if (copyOverlapRatio(slide.body, reference) > 0.4) {
    warnings.push(
      "Trechos parecidos demais com a matéria original (R2) — revise antes de usar.",
    );
  }
  return { slide, warnings };
}
