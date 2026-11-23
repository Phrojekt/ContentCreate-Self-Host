// Configurações editáveis pela interface (DEC-027): schema Zod + padrão de
// fábrica vindo de config/. Puro (sem banco): o store em
// services/settings/settings-store.ts persiste e lê.

import { keywords as defaultKeywords } from "@config/keywords";
import { projectConfig } from "@config/project.config";
import { rssFeeds as defaultFeeds } from "@config/sources";
import { z } from "zod";

import {
  allCategories,
  DEFAULT_CATEGORY_ID,
  defaultCategories,
  MAX_CATEGORY_RULES,
} from "@/lib/categories";
import { isPublicHttpUrl } from "@/lib/link-guard";
import type { RenderTheme, TemplateVariant } from "@/types/post";

export const SOCIAL_NETWORKS = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  threads: "Threads",
  x: "X (Twitter)",
  facebook: "Facebook",
} as const;
export type SocialNetwork = keyof typeof SOCIAL_NETWORKS;

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "cor no formato #RRGGBB");

const keywordList = z
  .array(z.string().trim().min(1).max(80))
  .max(300, "no máximo 300 palavras")
  .transform((list) => {
    const seen = new Set<string>();
    return list.filter((k) => {
      const key = k.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

/** Rótulo da categoria — desenhado no slide entre colchetes, em maiúsculas. */
const categoryLabel = z
  .string()
  .trim()
  .min(1, "dê um nome à categoria")
  .max(24, "nome da categoria com no máximo 24 caracteres")
  .transform((l) => l.toUpperCase());

export const feedSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "id só com letras minúsculas, números e hífen"),
  sourceName: z.string().trim().min(1, "dê um nome à fonte").max(80),
  url: z
    .string()
    .trim()
    .max(500)
    .refine(isPublicHttpUrl, "endereço público começando com http(s)://"),
  enabled: z.boolean().default(true),
});
export type FeedSetting = z.infer<typeof feedSchema>;

export const settingsSchema = z.object({
  profile: z.object({
    brandName: z
      .string()
      .trim()
      .min(1, "o nome da marca é obrigatório")
      .max(40),
    handle: z
      .string()
      .trim()
      .regex(
        /^@?[A-Za-z0-9._]{1,40}$/,
        "o @ só aceita letras, números, ponto e _",
      )
      .transform((h) => (h.startsWith("@") ? h : `@${h}`)),
    network: z.enum(
      Object.keys(SOCIAL_NETWORKS) as [SocialNetwork, ...SocialNetwork[]],
    ),
    /** Tema/nicho em poucas palavras — entra no prompt (ex.: "IA e Dados"). */
    niche: z.string().trim().min(2, "descreva o tema").max(60),
  }),
  colors: z.object({
    background: hex,
    surface: hex,
    grid: hex,
    title: hex,
    muted: hex,
  }),
  categories: z.object({
    fallback: z.object({ label: categoryLabel, accent: hex }),
    rules: z
      .array(
        z.object({
          id: z
            .string()
            .trim()
            .min(1)
            .max(40)
            .regex(
              /^[a-z0-9-]+$/,
              "id só com letras minúsculas, números e hífen",
            )
            .refine((id) => id !== DEFAULT_CATEGORY_ID, "id reservado"),
          label: categoryLabel,
          accent: hex,
          keywords: keywordList.refine(
            (l) => l.length > 0,
            "cada categoria precisa de ao menos uma palavra",
          ),
        }),
      )
      .max(
        MAX_CATEGORY_RULES,
        `no máximo ${MAX_CATEGORY_RULES} categorias além da padrão`,
      )
      .refine(
        (r) => new Set(r.map((x) => x.id)).size === r.length,
        "duas categorias com o mesmo id",
      ),
  }),
  keywords: z.object({
    required: keywordList.refine(
      (l) => l.length > 0,
      "informe ao menos uma palavra do tema",
    ),
    blocked: keywordList,
  }),
  feeds: z
    .array(feedSchema)
    .max(60, "no máximo 60 feeds")
    .refine(
      (f) => new Set(f.map((x) => x.id)).size === f.length,
      "dois feeds com o mesmo id",
    ),
});

export type AppSettingsData = z.infer<typeof settingsSchema>;

/** Seções que a UI salva separadamente (PATCH parcial). */
export const settingsPatchSchema = settingsSchema.partial();
export type AppSettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Padrão de fábrica = exatamente o que está em config/ hoje. */
export function defaultSettings(): AppSettingsData {
  const c = projectConfig.theme.design.colors;
  return {
    profile: {
      brandName: projectConfig.theme.design.brand,
      handle: projectConfig.social.instagramHandle,
      network: "instagram",
      niche: projectConfig.theme.name,
    },
    colors: {
      background: c.background,
      surface: c.surface,
      grid: c.grid,
      title: c.title,
      muted: c.muted,
    },
    categories: defaultCategories(),
    keywords: {
      required: [...defaultKeywords.required],
      blocked: [...defaultKeywords.blocked],
    },
    feeds: defaultFeeds.map((f) => ({ ...f, enabled: true })),
  };
}

/**
 * Lê o JSON salvo sobre o padrão, seção por seção: uma seção inválida (ex.:
 * schema antigo) cai no padrão sem derrubar as outras. Puro.
 */
export function resolveSettings(raw: unknown): AppSettingsData {
  const base = defaultSettings();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const out: AppSettingsData = { ...base };
  // Migração: registros de antes da DEC-028 guardavam os destaques em
  // `colors.accents` — viram as cores das 4 categorias padrão.
  if (!("categories" in obj)) {
    const legacy = (
      obj.colors as { accents?: Record<string, unknown> } | undefined
    )?.accents;
    if (legacy && typeof legacy === "object") {
      const pick = (k: string, fb: string) =>
        typeof legacy[k] === "string" &&
        /^#[0-9a-fA-F]{6}$/.test(legacy[k] as string)
          ? (legacy[k] as string)
          : fb;
      out.categories = {
        fallback: {
          ...base.categories.fallback,
          accent: pick("default", base.categories.fallback.accent),
        },
        rules: base.categories.rules.map((r) => ({
          ...r,
          accent: pick(r.id, r.accent),
        })),
      };
    }
  }
  for (const key of [
    "profile",
    "colors",
    "categories",
    "keywords",
    "feeds",
  ] as const) {
    if (!(key in obj)) continue;
    const parsed = settingsSchema.shape[key].safeParse(obj[key]);
    if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
  }
  return out;
}

/**
 * Temas do renderer: um por categoria (padrão + regras), com as cores fixas,
 * a cor e o rótulo da categoria. O layout não muda.
 */
export function themesFromSettings(
  s: AppSettingsData,
): Record<TemplateVariant, RenderTheme> {
  const overlay = projectConfig.theme.design.colors.overlay;
  const themes: Record<TemplateVariant, RenderTheme> = {};
  for (const cat of allCategories(s.categories)) {
    themes[cat.id] = {
      fontFamily: projectConfig.theme.design.fontFamily,
      brand: s.profile.brandName,
      categoryLabel: cat.label,
      colors: {
        background: s.colors.background,
        surface: s.colors.surface,
        grid: s.colors.grid,
        title: s.colors.title,
        muted: s.colors.muted,
        accent: cat.accent,
        overlay,
      },
    };
  }
  return themes;
}

/** Perfil usado pelo prompt e pelo verificador. */
export interface BrandProfile {
  brandName: string;
  handle: string;
  networkLabel: string;
  niche: string;
}

export function brandProfileOf(s: AppSettingsData): BrandProfile {
  return {
    brandName: s.profile.brandName,
    handle: s.profile.handle,
    networkLabel: SOCIAL_NETWORKS[s.profile.network],
    niche: s.profile.niche,
  };
}

/** Feeds ativos no formato da coleta. */
export function activeFeeds(s: AppSettingsData) {
  return s.feeds
    .filter((f) => f.enabled)
    .map(({ id, url, sourceName }) => ({ id, url, sourceName }));
}
