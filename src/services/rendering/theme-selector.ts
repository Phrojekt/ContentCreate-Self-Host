import { classifyCategory, defaultCategories } from "@/lib/categories";
import type { TemplateVariant } from "@/types";

/**
 * Seleciona a categoria do post com as categorias DE FÁBRICA (função pura).
 * Desde a DEC-028 a classificação real usa as categorias configuradas na
 * Identidade (`classifyCategory` em `src/lib/categories.ts`); esta função
 * fica para quem não recebe configuração (testes, scripts, memória legada).
 * Ordem de prioridade de fábrica: breaking > data > business > default.
 */
export function selectVariant(title: string, caption: string): TemplateVariant {
  return classifyCategory(title, caption, defaultCategories());
}
