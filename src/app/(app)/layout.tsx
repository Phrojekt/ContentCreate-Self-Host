import { AppShell } from "@/components/shell/sidebar";
import { SOCIAL_NETWORKS } from "@/lib/settings-schema";
import { getEffectiveSettings } from "@/services/settings/settings-store";
import { countDraftsByStatus } from "@/services/storage/draft-store";

// Contagens da navegação mudam a cada ação/rodada — sempre do banco.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [counts, settings] = await Promise.all([
    countDraftsByStatus(),
    getEffectiveSettings(),
  ]);
  return (
    <AppShell
      brand={{
        name: settings.profile.brandName,
        handle: settings.profile.handle,
        networkLabel: SOCIAL_NETWORKS[settings.profile.network],
      }}
      counts={{
        pending: counts.PENDING,
        approved: counts.APPROVED,
        rejected: counts.REJECTED,
      }}
    >
      {children}
    </AppShell>
  );
}
