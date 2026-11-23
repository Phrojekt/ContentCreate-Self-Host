// Motivos fixos de descarte (UI-10 — fecha P3-11 de backlogs.md). O código é o
// que vai para o banco (`Draft.rejectionReason`); o rótulo é o texto da UI e
// também entra na lição gravada na Memória (DEC-020).

export const REJECTION_REASONS = [
  { code: "off_topic", label: "Fora do tema da marca" },
  { code: "weak", label: "Pauta fraca / sem novidade" },
  { code: "duplicate", label: "Duplicada ou já postada" },
  { code: "factual_error", label: "Erro de fato" },
  { code: "copied", label: "Copiou demais da fonte" },
  { code: "tone", label: "Tom errado" },
  { code: "design", label: "Design quebrado" },
  { code: "other", label: "Outro motivo" },
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number]["code"];

export const REJECTION_REASON_CODES = REJECTION_REASONS.map((r) => r.code) as [
  RejectionReason,
  ...RejectionReason[],
];

/** Limite da nota livre do descarte. */
export const REJECTION_NOTE_MAX = 500;

/**
 * Motivos que NÃO viram lição de conteúdo: "design" é problema de template
 * (layout), não do texto gerado — ensinar o LLM com isso só gera ruído.
 */
export const REASONS_WITHOUT_LESSON: readonly RejectionReason[] = ["design"];

export function rejectionLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return REJECTION_REASONS.find((r) => r.code === code)?.label ?? code;
}
