import { AppError } from "@/lib/errors";
import type { DraftStatus } from "@/types";

/** Ações que um humano dispara sobre um rascunho (humano no loop — DEC-011). */
export type DraftAction = "approve" | "reject" | "publish" | "restore";

/**
 * Máquina de estados do `Draft` (DEC-011): rascunho → aprovado → publicado,
 * com rejeição possível antes de publicar. Função pura, sem I/O.
 *
 * - PENDING  --approve--> APPROVED   (aprova e exporta o pacote)
 * - PENDING  --reject-->  REJECTED
 * - APPROVED --publish--> PUBLISHED  (humano confirma que postou no agendador)
 * - APPROVED --reject-->  REJECTED
 * - REJECTED --restore--> PENDING    (desfazer descarte / devolver à revisão — UI-11)
 *
 * PUBLISHED é terminal. Desfazer APROVAÇÃO não existe (já exportou arquivos e
 * gravou memória — DEC-025).
 */
const TRANSITIONS: Record<
  DraftStatus,
  Partial<Record<DraftAction, DraftStatus>>
> = {
  PENDING: { approve: "APPROVED", reject: "REJECTED" },
  APPROVED: { publish: "PUBLISHED", reject: "REJECTED" },
  REJECTED: { restore: "PENDING" },
  PUBLISHED: {},
};

export function nextStatus(
  current: DraftStatus,
  action: DraftAction,
): DraftStatus {
  const next = TRANSITIONS[current][action];
  if (!next) {
    throw new AppError(
      `Transição inválida: não é possível "${action}" um rascunho ${current}.`,
      409,
      "INVALID_DRAFT_TRANSITION",
    );
  }
  return next;
}

/** Campos de decisão gravados junto da mudança de status (UI-10/UI-11/UI-12). */
export interface DecisionFields {
  approvedAt?: Date;
  rejectedAt?: Date | null;
  publishedAt?: Date;
  rejectionReason?: string | null;
  rejectionNote?: string | null;
}

/**
 * Campos que acompanham a transição para `next` (função pura). Ao voltar para
 * PENDING (restaurar), limpa motivo/nota/data do descarte.
 */
export function decisionFields(
  next: DraftStatus,
  now: Date,
  rejection: { reason?: string | null; note?: string | null } = {},
): DecisionFields {
  switch (next) {
    case "APPROVED":
      return { approvedAt: now };
    case "PUBLISHED":
      return { publishedAt: now };
    case "REJECTED":
      return {
        rejectedAt: now,
        rejectionReason: rejection.reason ?? null,
        rejectionNote: rejection.note?.trim() || null,
      };
    case "PENDING":
      return { rejectedAt: null, rejectionReason: null, rejectionNote: null };
  }
}
