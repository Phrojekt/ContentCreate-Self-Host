/** Status do ciclo de vida de um rascunho (humano no loop — DEC-011). */
export type DraftStatus = "PENDING" | "APPROVED" | "REJECTED" | "PUBLISHED";

/** Arquétipo narrativo/visual do slide (brand guide — docs/brand-guide-carrossel.md). */
export type SlideType =
  | "cover" // slide 1 — manchete + teaser (capa do carrossel)
  | "context" // contexto: o que aconteceu, por que importa, como funciona
  | "stat" // estatística: número gigante + rótulo + linha de apoio
  | "comparison" // comparação: duas colunas (antes/depois ou X vs Y)
  | "quote" // citação atribuída: texto + nome + cargo
  | "closing"; // fechamento: resumo + hashtags + CTA

/**
 * Conteúdo de um slide de corpo do carrossel: um gancho curto (`lead`) que abre
 * o slide em destaque + um parágrafo informativo (`body`) que o desenvolve com
 * fatos do texto. A separação lead/parágrafo dá ritmo de leitura e evita o
 * efeito "recorte" (frases avulsas e secas). Ambos reescritos (DEC-008).
 *
 * Campos condicionais (`stat`/`comparison`/`quote`) são opcionais e retrocompatíveis:
 * preenchidos apenas quando `slideType` exige e o texto-fonte sustenta o dado.
 */
export interface SlideContent {
  /** Gancho curto (≈3-6 palavras) que abre o slide — renderizado em destaque. */
  lead: string;
  /** Parágrafo informativo (1-2 frases) que desenvolve o gancho com fatos. */
  body: string;
  /** Arquétipo do slide (brand guide sec 6). Ausente em rascunhos antigos. */
  slideType?: SlideType;
  /** Rótulo de categoria em Mono uppercase — ex.: "O QUE ACONTECEU". */
  eyebrow?: string;
  stat?: {
    /** Número literal do texto-fonte (ex.: "40%", "US$ 2,3 bi", "3×"). */
    value: string;
    /** Uma linha explicando o que o número mede. */
    label: string;
    /** Metodologia/amostra (muted). */
    supporting?: string;
  };
  comparison?: {
    leftLabel: string;
    leftValue: string;
    leftDetail?: string;
    rightLabel: string;
    rightValue: string;
    rightDetail?: string;
  };
  quote?: {
    /** Frase atribuível, 1-2 frases. */
    text: string;
    /** Nome real, mencionado na matéria. */
    author: string;
    /** Cargo/organização (muted). */
    role: string;
  };
}

/** Rascunho de post gerado pelo LLM, aguardando revisão humana. */
export interface Draft {
  id: string;
  status: DraftStatus;
  shortTitle: string;
  caption: string;
  hashtags: string[];
  /** Slides do carrossel (vazio → carrossel sai da legenda). */
  slides: SlideContent[];
  newsItemId: string;
  createdAt: Date;
  updatedAt: Date;
  /** Motivo do descarte (código de `src/constants/rejection.ts`) — UI-10. */
  rejectionReason?: string | null;
  rejectionNote?: string | null;
  /** Datas das decisões humanas (UI-12). */
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
  publishedAt?: Date | null;
  /** Última edição humana do conteúdo (UI-32). */
  editedAt?: Date | null;
}
