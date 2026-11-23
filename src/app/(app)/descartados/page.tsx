import { projectConfig } from "@config/project.config";

import {
  DiscardedList,
  type DiscardedRow,
} from "@/components/discarded/discarded-list";
import { rejectionLabel } from "@/constants/rejection";
import { formatDateTime } from "@/lib/format";
import { daysUntilPurge } from "@/lib/retention";
import { listReviewQueue } from "@/services/storage/draft-store";

export const dynamic = "force-dynamic";

export default async function DescartadosPage() {
  const drafts = await listReviewQueue({ statuses: ["REJECTED"] });
  const days = projectConfig.retention.rejectedDays;
  const now = new Date();

  const rows: DiscardedRow[] = drafts
    .map((d) => {
      const when = d.rejectedAt ?? d.updatedAt;
      return {
        id: d.id,
        title: d.shortTitle,
        note: d.rejectionNote,
        reason: d.rejectionReason ?? "none",
        reasonLabel: rejectionLabel(d.rejectionReason) ?? "Sem motivo",
        source: d.source,
        when: formatDateTime(when),
        whenTs: when.getTime(),
        expiresIn: daysUntilPurge(when, now, days),
      };
    })
    .sort((a, b) => b.whenTs - a.whenTs);

  return <DiscardedList rows={rows} retentionDays={days} />;
}
