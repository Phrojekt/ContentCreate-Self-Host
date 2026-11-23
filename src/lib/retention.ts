// Regras puras de retenção dos descartados (UI-13/UI-30 — DEC-025 item 1).

const DAY = 24 * 60 * 60 * 1000;

/** Dias inteiros que faltam para o expurgo (0 = some na próxima rodada). */
export function daysUntilPurge(
  decidedAt: Date,
  now: Date,
  retentionDays: number,
): number {
  const elapsed = Math.floor((now.getTime() - decidedAt.getTime()) / DAY);
  return Math.max(0, retentionDays - elapsed);
}

/** Já passou do prazo de retenção? */
export function isPastRetention(
  decidedAt: Date,
  now: Date,
  retentionDays: number,
): boolean {
  return now.getTime() - decidedAt.getTime() >= retentionDays * DAY;
}

/** Data de corte: descartados com `rejectedAt` anterior a ela expiram. */
export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY);
}
