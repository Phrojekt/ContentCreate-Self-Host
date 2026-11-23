import {
  ReviewWorkspace,
  type ReviewItem,
  type SelectedDraft,
} from "@/components/review/review-workspace";
import { DIMENSIONS } from "@/constants/rendering";
import { REVIEW_TABS, type ReviewTab } from "@/constants/ui";
import { classifyCategory, resolveCategory } from "@/lib/categories";
import { QUALITY_MIN_SCORE } from "@/constants/quality";
import { formatAge } from "@/lib/format";
import { qualityChecks } from "@/lib/quality-checks";
import { buildDraftSlides, resolveFormat } from "@/services/publishing";
import {
  getDraftDetail,
  listReviewQueue,
} from "@/services/storage/draft-store";
import { getEffectiveSettings } from "@/services/settings/settings-store";
import type { DraftStatus, TemplateVariant } from "@/types";

export const dynamic = "force-dynamic";

const TAB_STATUSES: Record<ReviewTab, DraftStatus[]> = {
  pendentes: ["PENDING"],
  "nota-baixa": ["PENDING"],
  aprovados: ["APPROVED"],
};

export default async function RevisaoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; id?: string }>;
}) {
  const params = await searchParams;
  const settings = await getEffectiveSettings();
  const cats = settings.categories;
  const accentOf = (v: TemplateVariant) => resolveCategory(cats, v).accent;
  const tab: ReviewTab = REVIEW_TABS.includes(params.tab as ReviewTab)
    ? (params.tab as ReviewTab)
    : "pendentes";

  const [rawQueue, pendingQueue] = await Promise.all([
    listReviewQueue({ statuses: TAB_STATUSES[tab] }),
    tab === "pendentes" ? null : listReviewQueue({ statuses: ["PENDING"] }),
  ]);
  const pendingCount = (pendingQueue ?? rawQueue).length;
  const isLow = (score: number | null) =>
    score !== null && score < QUALITY_MIN_SCORE;
  const lowCount = (pendingQueue ?? rawQueue).filter((d) =>
    isLow(d.qualityScore),
  ).length;
  const queue =
    tab === "nota-baixa"
      ? rawQueue.filter((d) => isLow(d.qualityScore))
      : rawQueue;

  const now = new Date();
  const items: ReviewItem[] = queue.map((d) => {
    const variant = classifyCategory(d.shortTitle, d.caption, cats);
    return {
      id: d.id,
      status: d.status,
      shortTitle: d.shortTitle,
      caption: d.caption,
      hashtags: d.hashtags,
      source: d.source,
      url: d.url,
      age: formatAge(d.createdAt, now),
      accent: accentOf(variant),
      score: d.qualityScore,
    };
  });

  const current = items.find((d) => d.id === params.id) ?? items[0];
  const currentReport = queue.find((d) => d.id === current?.id)?.qualityReport;
  let selected: SelectedDraft | null = null;
  if (current) {
    const detail = await getDraftDetail(current.id);
    if (detail) {
      const slides = buildDraftSlides(detail, cats);
      const variant = slides[0]?.variant ?? "default";
      const format = resolveFormat();
      selected = {
        id: current.id,
        variantLabel: resolveCategory(cats, variant).label,
        accent: accentOf(variant),
        width: DIMENSIONS[format].width,
        height: DIMENSIONS[format].height,
        checks: currentReport ? qualityChecks(currentReport) : null,
        attempts: currentReport?.attempts ?? null,
        slides: slides.map((s, i) => ({
          index: i + 1,
          slideType: s.slideType ?? (i === 0 ? "cover" : "context"),
        })),
      };
    }
  }

  return (
    <ReviewWorkspace
      key={tab}
      tab={tab}
      items={items}
      selected={selected}
      pendingCount={pendingCount}
      lowCount={lowCount}
    />
  );
}
