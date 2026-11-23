// Categorias do post configuráveis (DEC-028). Cada categoria tem um rótulo
// (desenhado no slide como "[ RÓTULO ]"), uma cor de destaque e palavras que
// a ativam. A primeira regra cujas palavras aparecem no título + começo da
// legenda vence (ordem = prioridade); sem nenhuma, vale a categoria padrão.
// Puro — sem banco/rede/env; usado no servidor e no editor (cliente).

import { projectConfig } from "@config/project.config";

/** Id da categoria padrão (fallback) — também é a variante "default" do tema. */
export const DEFAULT_CATEGORY_ID = "default";
export const MAX_CATEGORY_RULES = 7;

export interface CategoryRule {
  /** Slug estável (vira a "variante" do post e a categoria da Memória). */
  id: string;
  label: string;
  accent: string;
  /** Palavras/expressões que ativam a categoria. `*` no fim = prefixo. */
  keywords: string[];
}

export interface CategoriesConfig {
  fallback: { label: string; accent: string };
  rules: CategoryRule[];
}

export interface ResolvedCategory {
  id: string;
  label: string;
  accent: string;
}

/** Padrão = as 4 categorias de antes (mesmas palavras de theme-selector). */
export function defaultCategories(): CategoriesConfig {
  const t = projectConfig.templates;
  return {
    fallback: { label: "IA", accent: t.default.colors.accent },
    rules: [
      {
        id: "breaking",
        label: "LANÇAMENTO",
        accent: t.breaking.colors.accent,
        keywords: [
          "lança",
          "anuncia",
          "lançamento",
          "revelado",
          "revela",
          "apresenta",
          "launches",
          "announces",
          "releases",
          "unveils",
          "introduces",
        ],
      },
      {
        id: "data",
        label: "ANALYTICS",
        accent: t.data.colors.accent,
        keywords: [
          "relatório",
          "pesquisa",
          "estudo",
          "análise",
          "dashboard",
          "analytics",
          "benchmark",
          "métrica",
          "métricas",
          "estatística",
          "survey",
          "dataset",
        ],
      },
      {
        id: "business",
        label: "NEGÓCIOS",
        accent: t.business.colors.accent,
        keywords: [
          "empresa",
          "startup",
          "investimento",
          "aquisição",
          "fusão",
          "ipo",
          "funding",
          "valuation",
          "parceria",
          "capital",
          "mercado",
          "negócio",
          "produto",
        ],
      },
    ],
  };
}

/** Minúsculas e sem acento — comparação tolerante ("Análise" = "analise"). */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Palavra inteira (ou prefixo com `*` no fim) dentro do texto normalizado. */
export function keywordMatches(
  normalizedText: string,
  keyword: string,
): boolean {
  const raw = normalizeText(keyword.trim());
  if (!raw) return false;
  const prefix = raw.endsWith("*");
  const kw = escape(prefix ? raw.slice(0, -1) : raw);
  if (!kw) return false;
  const re = new RegExp(`(^|[^a-z0-9])${kw}${prefix ? "" : "(?![a-z0-9])"}`);
  return re.test(normalizedText);
}

/** Id da categoria do post: 1ª regra que casa, senão a padrão. */
export function classifyCategory(
  title: string,
  caption: string,
  config: CategoriesConfig,
): string {
  const text = normalizeText(`${title} ${caption.slice(0, 300)}`);
  for (const rule of config.rules) {
    if (rule.keywords.some((k) => keywordMatches(text, k))) return rule.id;
  }
  return DEFAULT_CATEGORY_ID;
}

/** Rótulo e cor de uma categoria pelo id (id desconhecido → padrão). */
export function resolveCategory(
  config: CategoriesConfig,
  id: string | undefined,
): ResolvedCategory {
  const rule = config.rules.find((r) => r.id === id);
  if (rule) return { id: rule.id, label: rule.label, accent: rule.accent };
  return {
    id: DEFAULT_CATEGORY_ID,
    label: config.fallback.label,
    accent: config.fallback.accent,
  };
}

/** Todas as categorias, padrão primeiro. */
export function allCategories(config: CategoriesConfig): ResolvedCategory[] {
  return [
    resolveCategory(config, DEFAULT_CATEGORY_ID),
    ...config.rules.map((r) => ({
      id: r.id,
      label: r.label,
      accent: r.accent,
    })),
  ];
}
