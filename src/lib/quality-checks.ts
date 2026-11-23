// Tradução do diagnóstico do verificador (`scoreOutput`) em linhas legíveis
// para o bloco "Verificações automáticas" da Revisão (UI-21). Puro.

export type CheckState = "ok" | "warn" | "bad";

export interface QualityCheck {
  key: string;
  label: string;
  state: CheckState;
  note: string;
}

/** Critérios mostrados, com a pontuação máxima de cada um (quality-scorer.ts). */
const CRITERIA: { key: string; label: string; max: number; ok: string }[] = [
  {
    key: "language",
    label: "Idioma",
    max: 20,
    ok: "texto em português, sem trechos em inglês",
  },
  {
    key: "originality",
    label: "Originalidade",
    max: 15,
    ok: "reescrito com palavras próprias, sem cópia da matéria",
  },
  {
    key: "archetypeVariety",
    label: "Variedade de slides",
    max: 10,
    ok: "arquétipos variados ao longo do carrossel",
  },
  {
    key: "lastSlide",
    label: "Fechamento",
    max: 20,
    ok: "último slide com CTA e pergunta",
  },
  {
    key: "bodyLength",
    label: "Tamanho dos slides",
    max: 20,
    ok: "parágrafos no tamanho certo",
  },
  {
    key: "leadQuality",
    label: "Ganchos",
    max: 20,
    ok: "cada slide abre com um gancho próprio",
  },
  {
    key: "slideCount",
    label: "Quantidade de slides",
    max: 15,
    ok: "proporcional ao conteúdo da notícia",
  },
  {
    key: "caption",
    label: "Legenda",
    max: 10,
    ok: "credita a fonte e tem tamanho suficiente",
  },
];

/** Palavras que ligam uma violação a um critério (para a nota explicativa). */
const MATCH: Record<string, RegExp> = {
  language: /ingl[eê]s|idioma|english/i,
  originality: /c[oó]pia|literal|original/i,
  archetypeVariety: /arqu[eé]tipo/i,
  lastSlide: /[uú]ltimo slide|cta|pergunta/i,
  bodyLength: /body|par[aá]grafo|curto|longo|caracteres/i,
  leadQuality: /lead/i,
  slideCount: /slides? \(|quantidade|n[uú]mero de slides/i,
  caption: /caption|legenda|fonte/i,
};

export function qualityChecks(report: {
  breakdown: Record<string, number>;
  violations: string[];
}): QualityCheck[] {
  return CRITERIA.filter((c) => c.key in report.breakdown).map((c) => {
    const score = report.breakdown[c.key] ?? 0;
    const state: CheckState =
      score >= c.max ? "ok" : score > 0 ? "warn" : "bad";
    const violation = report.violations.find((v) => MATCH[c.key]?.test(v));
    return {
      key: c.key,
      label: c.label,
      state,
      note: state === "ok" ? c.ok : (violation ?? `${score}/${c.max} pontos`),
    };
  });
}
