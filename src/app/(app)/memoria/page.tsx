import { MemoryBoard, type MemoryCard } from "@/components/memory/memory-board";
import { formatDateTime } from "@/lib/format";
import { listMemoryEntries } from "@/services/memory";
import { getDraftStatuses } from "@/services/storage/draft-store";

export const dynamic = "force-dynamic";

export default async function MemoriaPage() {
  const entries = await listMemoryEntries({ limit: 500 });
  const draftIds = [
    ...new Set(entries.map((e) => e.draftId).filter((x): x is string => !!x)),
  ];
  const statuses = new Map(
    (draftIds.length > 0 ? await getDraftStatuses(draftIds) : []).map((d) => [
      d.id,
      d.status,
    ]),
  );
  // Link para onde o rascunho de origem está hoje (se ainda existir).
  const hrefFor = (id: string | null): string | null => {
    const st = id ? statuses.get(id) : undefined;
    if (!id || !st) return null;
    if (st === "PENDING") return `/revisao?id=${id}`;
    if (st === "APPROVED") return `/revisao?tab=aprovados&id=${id}`;
    if (st === "REJECTED") return "/descartados";
    return "/agenda";
  };

  const cards: MemoryCard[] = entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    source: e.source,
    content: e.content,
    category: e.category,
    active: e.active,
    when: formatDateTime(new Date(e.createdAt)),
    draftHref: hrefFor(e.draftId),
  }));

  return <MemoryBoard cards={cards} />;
}
