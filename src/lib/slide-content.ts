import type { SlideContent } from "@/types";

/**
 * Normaliza um array desconhecido (JSON já parseado) em `SlideContent[]`.
 * Única fonte de verdade para essa conversão — usada tanto ao interpretar a
 * resposta JSON fresca do LLM (`prompt.ts`) quanto ao reler um rascunho já
 * salvo no banco (`draft-store.ts`). As duas pontas já divergiram uma vez
 * (parser duplicado em `draft-store.ts` só extraía `lead`/`body`, descartando
 * `slideType`/`stat`/`comparison`/`quote` — todo post relido do banco colapsava
 * para o arquétipo genérico "contexto", não importa o que o LLM tivesse
 * gerado). Não duplique esta lógica de novo.
 *
 * Tolera:
 * - objetos `{ lead, body, ... }` (formato atual, com campos condicionais);
 * - strings soltas (formato antigo / modelo que ignorou a estrutura) → viram
 *   `body` com `lead` vazio (o template renderiza só o parágrafo).
 * Itens sem texto de corpo aproveitável são descartados.
 */
const VALID_SLIDE_TYPES = [
  "cover",
  "context",
  "stat",
  "comparison",
  "quote",
  "closing",
] as const;

export function parseSlideContentArray(value: unknown): SlideContent[] {
  if (!Array.isArray(value)) return [];
  const slides: SlideContent[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      if (item.trim()) slides.push({ lead: "", body: item });
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const lead = typeof obj["lead"] === "string" ? obj["lead"] : "";
      const body = typeof obj["body"] === "string" ? obj["body"] : "";
      if (!body.trim()) continue;

      const slide: SlideContent = { lead, body };

      if (
        typeof obj["slideType"] === "string" &&
        (VALID_SLIDE_TYPES as readonly string[]).includes(obj["slideType"])
      ) {
        slide.slideType = obj["slideType"] as SlideContent["slideType"];
      }

      if (typeof obj["eyebrow"] === "string" && obj["eyebrow"].trim()) {
        slide.eyebrow = obj["eyebrow"].trim();
      }

      if (obj["stat"] && typeof obj["stat"] === "object") {
        const s = obj["stat"] as Record<string, unknown>;
        if (typeof s["value"] === "string" && typeof s["label"] === "string") {
          slide.stat = {
            value: s["value"],
            label: s["label"],
            ...(typeof s["supporting"] === "string"
              ? { supporting: s["supporting"] }
              : {}),
          };
        }
      }

      if (obj["comparison"] && typeof obj["comparison"] === "object") {
        const c = obj["comparison"] as Record<string, unknown>;
        if (
          typeof c["leftLabel"] === "string" &&
          typeof c["leftValue"] === "string" &&
          typeof c["rightLabel"] === "string" &&
          typeof c["rightValue"] === "string"
        ) {
          slide.comparison = {
            leftLabel: c["leftLabel"],
            leftValue: c["leftValue"],
            ...(typeof c["leftDetail"] === "string"
              ? { leftDetail: c["leftDetail"] }
              : {}),
            rightLabel: c["rightLabel"],
            rightValue: c["rightValue"],
            ...(typeof c["rightDetail"] === "string"
              ? { rightDetail: c["rightDetail"] }
              : {}),
          };
        }
      }

      if (obj["quote"] && typeof obj["quote"] === "object") {
        const q = obj["quote"] as Record<string, unknown>;
        if (
          typeof q["text"] === "string" &&
          typeof q["author"] === "string" &&
          typeof q["role"] === "string"
        ) {
          slide.quote = {
            text: q["text"],
            author: q["author"],
            role: q["role"],
          };
        }
      }

      slides.push(slide);
    }
  }
  return slides;
}
