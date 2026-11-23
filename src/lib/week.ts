// Semana da Agenda (UI-14): segunda a domingo, no fuso do servidor. Puro.

const DAY = 24 * 60 * 60 * 1000;

/** Segunda-feira 00:00 da semana que contém `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dow);
  return d;
}

/** Os 7 dias (00:00) da semana que começa em `start`. */
export function weekDays(start: Date): Date[] {
  return Array.from(
    { length: 7 },
    (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

/** "AAAA-MM-DD" local (parâmetro `?semana=`). */
export function toIsoDay(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Lê `?semana=AAAA-MM-DD` (qualquer dia da semana); inválido → semana atual. */
export function parseWeekParam(value: string | undefined, now: Date): Date {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return startOfWeek(now);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? startOfWeek(now) : startOfWeek(d);
}

/** `date` cai dentro da semana iniciada em `start`? */
export function isInWeek(date: Date, start: Date): boolean {
  const t = date.getTime();
  const end = weekDays(start)[6]!.getTime() + DAY;
  return t >= start.getTime() && t < end;
}

/** Rótulo "17 – 23 de novembro" (ou "28 de out. – 3 de nov."). */
export function weekLabel(start: Date): string {
  const end = weekDays(start)[6]!;
  const month = (d: Date) =>
    new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(d);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} de ${month(end)}`;
  }
  return `${start.getDate()} de ${month(start)} – ${end.getDate()} de ${month(end)}`;
}
