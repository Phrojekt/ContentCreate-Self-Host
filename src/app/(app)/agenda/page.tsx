import {
  AgendaBoard,
  type AgendaDay,
  type ReadyItem,
} from "@/components/agenda/agenda-board";
import { formatAge } from "@/lib/format";
import {
  isInWeek,
  parseWeekParam,
  toIsoDay,
  weekDays,
  weekLabel,
} from "@/lib/week";
import { listExportedFiles, outputDir } from "@/services/publishing";
import { listReviewQueue } from "@/services/storage/draft-store";

export const dynamic = "force-dynamic";

const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const TIME = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const { semana } = await searchParams;
  const now = new Date();
  const start = parseWeekParam(semana, now);
  const days = weekDays(start);

  const [approved, published] = await Promise.all([
    listReviewQueue({ statuses: ["APPROVED"] }),
    listReviewQueue({ statuses: ["PUBLISHED"] }),
  ]);

  const out = outputDir();
  const ready: ReadyItem[] = await Promise.all(
    approved
      .map((d) => ({ d, at: d.approvedAt ?? d.updatedAt }))
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .map(async ({ d, at }) => {
        const files = await listExportedFiles(out, d.id);
        const cover = files.find((f) => f.endsWith(".png"));
        return {
          id: d.id,
          title: d.shortTitle,
          source: d.source,
          approvedAge: formatAge(at, now),
          captionText: `${d.caption}\n\n${d.hashtags.map((h) => `#${h}`).join(" ")}\n`,
          files,
          coverUrl: cover
            ? `/api/drafts/${d.id}/files/${cover}`
            : `/api/drafts/${d.id}/preview`,
        };
      }),
  );

  const today = toIsoDay(now);
  const grid: AgendaDay[] = days.map((day) => {
    const iso = toIsoDay(day);
    const items = published
      .map((d) => ({ d, at: d.publishedAt ?? d.updatedAt }))
      .filter(({ at }) => toIsoDay(at) === iso)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map(({ d, at }) => ({
        id: d.id,
        title: d.shortTitle,
        time: TIME.format(at),
      }));
    return {
      iso,
      weekday: WEEKDAY.format(day).replace(".", ""),
      day: day.getDate(),
      isToday: iso === today,
      items,
    };
  });

  const prev = new Date(start);
  prev.setDate(prev.getDate() - 7);
  const next = new Date(start);
  next.setDate(next.getDate() + 7);
  const publishedThisWeek = published.filter((d) =>
    isInWeek(d.publishedAt ?? d.updatedAt, start),
  ).length;

  return (
    <AgendaBoard
      ready={ready}
      days={grid}
      label={weekLabel(start)}
      prevWeek={toIsoDay(prev)}
      nextWeek={toIsoDay(next)}
      publishedThisWeek={publishedThisWeek}
    />
  );
}
