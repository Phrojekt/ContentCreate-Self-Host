// Constantes da interface de revisão (UI v2 — DEC-025). Só apresentação:
// rótulos e textos de tela. Cores do POST continuam em config/project.config.ts.
import type { SlideType, TemplateVariant } from "@/types";

/** Rótulo curto (Mono uppercase) da categoria/variante do post. */
export const VARIANT_LABEL: Record<TemplateVariant, string> = {
  default: "IA",
  breaking: "LANÇAMENTO",
  data: "DADOS",
  business: "NEGÓCIOS",
};

/** Nome legível do arquétipo do slide (tira de slides, editor). */
export const SLIDE_TYPE_LABEL: Record<SlideType, string> = {
  cover: "CAPA",
  context: "CONTEXTO",
  stat: "NÚMERO",
  comparison: "COMPARAÇÃO",
  quote: "CITAÇÃO",
  closing: "FECHAMENTO",
};

/** Abas da tela Revisão. */
export const REVIEW_TABS = ["pendentes", "nota-baixa", "aprovados"] as const;
export type ReviewTab = (typeof REVIEW_TABS)[number];
