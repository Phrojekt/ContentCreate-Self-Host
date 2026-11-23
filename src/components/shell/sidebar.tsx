import { BottomNav, SidebarNav, type NavCounts } from "./nav-links";

/**
 * Rotas com tela implementada. Itens de navegação de telas que ainda não
 * existem ficam ocultos até a fase que as cria (UI-01).
 */
export const ENABLED_ROUTES = [
  "/",
  "/revisao",
  "/agenda",
  "/descartados",
  "/esteira",
  "/fontes",
  "/marca",
  "/memoria",
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div
        aria-hidden="true"
        className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-ink"
      >
        <div className="h-2.5 w-2.5 rounded-full border-2 border-[#B9BCFF] border-r-transparent" />
      </div>
      <span className="text-[15px] font-bold tracking-[-0.01em]">
        Content Create
      </span>
    </div>
  );
}

/** Marca exibida no shell (DEC-027 — editável em Identidade). */
export interface ShellBrand {
  name: string;
  handle: string;
  networkLabel: string;
}

function CurrentBrand({ brand: b }: { brand: ShellBrand }) {
  const brand = b.name;
  const initials = brand
    .split(/[^A-Za-zÀ-ú]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface p-2">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-post-bg font-mono text-xs font-semibold text-[#9AA6FF]"
      >
        {initials}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold text-ink">{brand}</span>
        <span className="truncate text-xs text-muted">
          {b.handle} · {b.networkLabel}
        </span>
      </span>
    </div>
  );
}

/**
 * Shell da UI v2: sidebar persistente (≥ 768px) e barra superior + inferior no
 * celular. Contagens vêm do servidor (layout).
 */
export function AppShell({
  counts,
  brand,
  footer,
  children,
}: {
  counts: NavCounts;
  brand: ShellBrand;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <nav
        aria-label="Navegação principal"
        className="sticky top-0 hidden h-screen w-[248px] flex-none flex-col gap-[18px] overflow-y-auto border-r border-line bg-surface-2 px-3.5 py-5 md:flex"
      >
        <BrandMark />
        <CurrentBrand brand={brand} />
        <SidebarNav counts={counts} enabled={ENABLED_ROUTES} />
        <div className="flex-1" />
        {footer}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-surface-2 px-5 py-3 md:hidden">
          <BrandMark />
          <span className="text-xs text-muted">{brand.handle}</span>
        </header>
        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
          {children}
        </div>
      </div>

      <BottomNav counts={counts} enabled={ENABLED_ROUTES} />
    </div>
  );
}
