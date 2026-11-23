// Textos determinísticos da UI v2 a partir das rodadas persistidas (UI-22/UI-23).
// SEM LLM (DEC-025 item 6): tudo aqui é função pura e testável.

import { formatAge } from "@/lib/format";

/** Recorte mínimo da rodada de que estas funções precisam. */
export interface RunSummary {
  startedAt: Date;
  status: "RUNNING" | "OK" | "PARTIAL" | "FAILED" | "SKIPPED";
  collected: number;
  afterDedup: number;
  afterFilter: number;
  afterAlreadyProcessed: number;
  afterSemantic: number;
  selected: number;
  skippedThinContent: number;
  draftsCreated: number;
  errors: string[];
  failure: string | null;
}

export interface Briefing {
  headline: string;
  body: string;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Saudação pelo horário local do servidor. */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Briefing do Início: manchete + parágrafo curto, montados só com números
 * reais da última rodada e da fila.
 */
export function buildBriefing(
  lastRun: RunSummary | null,
  pendingCount: number,
  lowScoreCount: number,
  now: Date,
  /** Pendentes que têm nota (rascunhos antigos não têm). Default: todos. */
  scoredCount: number = pendingCount,
): Briefing {
  const headline =
    pendingCount === 0
      ? `${greeting(now)}. Nenhum rascunho esperando.`
      : `${greeting(now)}. Você tem ${plural(pendingCount, "rascunho esperando", "rascunhos esperando")}.`;

  if (!lastRun) {
    return {
      headline,
      body: "Ainda não há rodadas registradas. Rode a esteira para coletar notícias e gerar os primeiros rascunhos — nada vai ao ar sem a sua aprovação.",
    };
  }

  const when = formatAge(lastRun.startedAt, now);
  const parts: string[] = [];

  if (lastRun.status === "RUNNING") {
    parts.push(`Há uma rodada em andamento (começou ${when}).`);
  } else if (lastRun.status === "FAILED" && lastRun.draftsCreated === 0) {
    parts.push(
      `A última rodada (${when}) falhou${lastRun.failure ? `: ${lastRun.failure}` : lastRun.errors[0] ? `: ${lastRun.errors[0]}` : "."}`,
    );
  } else {
    parts.push(
      `Na última rodada (${when}), das ${plural(lastRun.collected, "notícia coletada", "notícias coletadas")}, ${plural(lastRun.draftsCreated, "virou rascunho", "viraram rascunho")}.`,
    );
    if (lastRun.errors.length > 0) {
      parts.push(
        `${plural(lastRun.errors.length, "item deu erro", "itens deram erro")} no caminho — veja em Esteira.`,
      );
    }
    if (lastRun.skippedThinContent > 0) {
      parts.push(
        `${plural(lastRun.skippedThinContent, "notícia ficou", "notícias ficaram")} de fora por ter texto curto demais.`,
      );
    }
  }

  if (lowScoreCount > 0) {
    parts.push(
      `${plural(lowScoreCount, "rascunho pendente ficou", "rascunhos pendentes ficaram")} com nota abaixo do piso — merece${lowScoreCount === 1 ? "" : "m"} um olhar mais crítico.`,
    );
  } else if (pendingCount > 0 && scoredCount === pendingCount) {
    parts.push("Todos os pendentes passaram nas verificações automáticas.");
  }

  return { headline, body: parts.join(" ") };
}

export interface FunnelStep {
  label: string;
  value: number;
  /** Quantos saíram nesta etapa (negativo) e por quê. */
  note: string;
}

/** Funil da rodada em 4 etapas legíveis (Início e Esteira). */
export function runFunnel(run: RunSummary): FunnelStep[] {
  const filtered = run.afterFilter;
  const fresh = run.afterSemantic;
  return [
    { label: "Coleta", value: run.collected, note: "notícias lidas" },
    {
      label: "Filtro e duplicadas",
      value: filtered,
      note: `−${Math.max(0, run.collected - filtered)} duplicadas ou fora do tema`,
    },
    {
      label: "Seleção",
      value: run.selected,
      note: `−${Math.max(0, filtered - fresh)} já processadas · −${Math.max(0, fresh - run.selected)} além do limite`,
    },
    {
      label: "Geração",
      value: run.draftsCreated,
      note: `−${run.skippedThinContent} texto curto · −${Math.max(0, run.selected - run.skippedThinContent - run.draftsCreated)} com erro`,
    },
  ];
}

export interface DropReason {
  label: string;
  count: number;
}

/** "Por que N ficaram de fora" — diferenças entre etapas consecutivas. */
export function dropReasons(run: RunSummary): {
  total: number;
  reasons: DropReason[];
} {
  const reasons: DropReason[] = [
    {
      label: "Duplicadas (mesmo título em feeds diferentes)",
      count: run.collected - run.afterDedup,
    },
    {
      label: "Fora do tema (palavras-chave)",
      count: run.afterDedup - run.afterFilter,
    },
    {
      label: "Já processadas em rodadas anteriores",
      count: run.afterFilter - run.afterAlreadyProcessed,
    },
    {
      label: "Mesma notícia por similaridade de sentido",
      count: run.afterAlreadyProcessed - run.afterSemantic,
    },
    {
      label: "Além do limite de seleção da rodada",
      count: run.afterSemantic - run.selected,
    },
    {
      label: "Texto curto demais (anti-alucinação)",
      count: run.skippedThinContent,
    },
    {
      label: "Erro ao gerar",
      count: run.selected - run.skippedThinContent - run.draftsCreated,
    },
  ]
    .map((r) => ({ ...r, count: Math.max(0, r.count) }))
    .filter((r) => r.count > 0);
  return {
    total: reasons.reduce((a, r) => a + r.count, 0),
    reasons,
  };
}

const WEEKDAYS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

/**
 * Traduz a expressão cron do agendador para uma frase. Cobre `m h * * *`
 * (todo dia) e `m h * * d` / `d-d` / `d,d` (dias da semana); qualquer outra
 * forma devolve `null` (a UI mostra a expressão crua).
 */
export function cronToPhrase(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h, dom, mon, dow] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (!/^\d{1,2}$/.test(m) || dom !== "*" || mon !== "*") return null;
  const minute = Number(m);
  if (minute > 59) return null;

  const hours = h.split(",");
  if (!hours.every((x) => /^\d{1,2}$/.test(x) && Number(x) <= 23)) return null;
  const times = hours
    .map((x) => `${x.padStart(2, "0")}:${String(minute).padStart(2, "0")}`)
    .join(", ");
  const at =
    hours.length === 1
      ? `às ${times}`
      : `às ${times.replace(/, ([^,]*)$/, " e $1")}`;

  if (dow === "*") return `Todo dia ${at}`;
  const range = /^([0-7])-([0-7])$/.exec(dow);
  if (range) {
    const a = Number(range[1]) % 7;
    const b = Number(range[2]) % 7;
    if (a === 1 && b === 5) return `De segunda a sexta ${at}`;
    return `De ${WEEKDAYS[a]} a ${WEEKDAYS[b]} ${at}`;
  }
  if (/^[0-7](,[0-7])*$/.test(dow)) {
    const names = dow.split(",").map((d) => WEEKDAYS[Number(d) % 7]!);
    const list =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
    return `Toda ${list} ${at}`;
  }
  return null;
}
