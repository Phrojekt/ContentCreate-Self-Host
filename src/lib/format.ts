// Formatação de datas/tempos para a UI (pt-BR). Funções puras — `now` é
// injetável para teste e para calcular no servidor (evita divergência de
// hidratação entre relógio do servidor e do navegador).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Idade relativa curta: "agora", "há 5 min", "há 6 h", "há 3 dias". */
export function formatAge(date: Date, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - date.getTime());
  if (diff < MINUTE) return "agora";
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `há ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor(diff / DAY);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/** Data curta: "18 nov · 08:04". */
export function formatDateTime(date: Date): string {
  const d = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  })
    .format(date)
    .replace(".", "")
    .replace(" de ", " ");
  const t = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${d} · ${t}`;
}

/** Custo em dólar com 2–4 casas: "US$ 0,0123". */
export function formatUsd(value: number): string {
  const digits = value > 0 && value < 0.01 ? 4 : 2;
  return `US$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}
