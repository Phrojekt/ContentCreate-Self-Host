"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  IconBook,
  IconBrand,
  IconCalendar,
  IconHome,
  IconInbox,
  IconPipeline,
  IconRss,
  IconTrash,
} from "@/components/ui/icons";

export interface NavCounts {
  pending: number;
  approved: number;
  rejected: number;
}

type CountKey = keyof NavCounts;

interface NavItem {
  href: string;
  label: string;
  /** Rótulo curto da barra inferior (celular). */
  short?: string;
  Icon: (p: { size?: number }) => React.ReactNode;
  count?: CountKey;
  /** Contagem em destaque (pílula azul) vs. discreta (número cinza). */
  strong?: boolean;
  /** Aparece na barra inferior do celular. */
  mobile?: boolean;
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Início", Icon: IconHome, mobile: true },
      {
        href: "/revisao",
        label: "Revisão",
        Icon: IconInbox,
        count: "pending",
        strong: true,
        mobile: true,
      },
      {
        href: "/agenda",
        label: "Agenda",
        Icon: IconCalendar,
        count: "approved",
        mobile: true,
      },
      {
        href: "/descartados",
        label: "Descartados",
        Icon: IconTrash,
        count: "rejected",
        mobile: true,
      },
    ],
  },
  {
    title: "AUTOMAÇÃO",
    items: [
      { href: "/esteira", label: "Esteira", Icon: IconPipeline },
      { href: "/fontes", label: "Fontes", Icon: IconRss },
    ],
  },
  {
    title: "MARCA",
    items: [
      { href: "/marca", label: "Identidade", Icon: IconBrand },
      { href: "/memoria", label: "Memória", Icon: IconBook },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Itens de navegação da sidebar (desktop). Estado ativo pela rota. */
export function SidebarNav({
  counts,
  enabled,
}: {
  counts: NavCounts;
  enabled: string[];
}) {
  const pathname = usePathname();
  return (
    <>
      {NAV_GROUPS.map((group, gi) => {
        const items = group.items.filter((i) => enabled.includes(i.href));
        if (items.length === 0) return null;
        return (
          <div key={gi} className="flex flex-col gap-0.5">
            {group.title && (
              <span className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted">
                {group.title}
              </span>
            )}
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              const count = item.count ? counts[item.count] : undefined;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-10 items-center gap-2.5 rounded-[9px] px-2.5 text-sm no-underline ${
                    active
                      ? "bg-accent-soft-2 font-semibold text-accent-ink"
                      : "font-medium text-ink-2 hover:bg-chip/60"
                  }`}
                >
                  <item.Icon />
                  <span className="flex-1">{item.label}</span>
                  {count !== undefined &&
                    count > 0 &&
                    (item.strong ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 font-mono text-[11px] font-semibold text-white">
                        {count}
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-muted">
                        {count}
                      </span>
                    ))}
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

/** Barra de navegação inferior (celular, < 768px). */
export function BottomNav({
  counts,
  enabled,
}: {
  counts: NavCounts;
  enabled: string[];
}) {
  const pathname = usePathname();
  const items = NAV_GROUPS.flatMap((g) => g.items).filter(
    (i) => i.mobile && enabled.includes(i.href),
  );
  return (
    <nav
      aria-label="Navegação"
      className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-line bg-surface-2 px-2 pt-1.5 pb-3.5 md:hidden"
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const count = item.count ? counts[item.count] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-12 w-[72px] flex-col items-center justify-center gap-[3px] text-[11px] no-underline ${
              active
                ? "font-semibold text-accent-ink"
                : "font-medium text-muted"
            }`}
          >
            <item.Icon size={20} />
            {item.short ?? item.label}
            {item.strong && count > 0 && (
              <span className="absolute top-0.5 right-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-semibold text-white">
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
