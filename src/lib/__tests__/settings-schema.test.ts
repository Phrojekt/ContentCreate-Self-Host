import { keywords } from "@config/keywords";
import { projectConfig } from "@config/project.config";
import { rssFeeds } from "@config/sources";
import { describe, expect, it } from "vitest";

import {
  activeFeeds,
  brandProfileOf,
  defaultSettings,
  resolveSettings,
  settingsSchema,
  themesFromSettings,
} from "@/lib/settings-schema";

describe("settings (DEC-027)", () => {
  it("padrão de fábrica = config/ de hoje", () => {
    const d = defaultSettings();
    expect(d.profile.handle).toBe(projectConfig.social.instagramHandle);
    expect(d.profile.network).toBe("instagram");
    expect(d.keywords.required).toEqual(keywords.required);
    expect(d.feeds.map((f) => f.url)).toEqual(rssFeeds.map((f) => f.url));
    expect(settingsSchema.safeParse(d).success).toBe(true);
    // Temas iguais aos de config/ (+ rótulo de fábrica) → posts iguais a antes.
    const themes = themesFromSettings(d);
    for (const [k, t] of Object.entries(projectConfig.templates)) {
      expect(themes[k]).toMatchObject(t);
    }
    expect(themes["data"]!.categoryLabel).toBe("ANALYTICS");
  });

  it("sem registro ou JSON lixo → padrão", () => {
    expect(resolveSettings(null)).toEqual(defaultSettings());
    expect(resolveSettings("x")).toEqual(defaultSettings());
  });

  it("seção inválida cai no padrão sem derrubar as outras", () => {
    const s = resolveSettings({
      profile: {
        brandName: "Fin",
        handle: "fin.br",
        network: "linkedin",
        niche: "Finanças",
      },
      colors: { background: "vermelho" },
    });
    expect(s.profile).toEqual({
      brandName: "Fin",
      handle: "@fin.br",
      network: "linkedin",
      niche: "Finanças",
    });
    expect(s.colors).toEqual(defaultSettings().colors);
  });

  it("valida cores, @, feeds públicos e ids únicos", () => {
    const d = defaultSettings();
    const bad = (patch: object) =>
      settingsSchema.safeParse({ ...d, ...patch }).success;
    expect(bad({ colors: { ...d.colors, title: "#FFF" } })).toBe(false);
    expect(bad({ profile: { ...d.profile, handle: "@com espaço" } })).toBe(
      false,
    );
    expect(
      bad({
        feeds: [
          {
            id: "x",
            sourceName: "X",
            url: "http://localhost/rss",
            enabled: true,
          },
        ],
      }),
    ).toBe(false);
    const f = {
      id: "a",
      sourceName: "A",
      url: "https://a.com/feed",
      enabled: true,
    };
    expect(bad({ feeds: [f, f] })).toBe(false);
    expect(bad({ keywords: { required: [], blocked: [] } })).toBe(false);
  });

  it("deduplica palavras-chave ignorando maiúsculas", () => {
    const k = settingsSchema.shape.keywords.parse({
      required: ["IA", "ia", " LLM "],
      blocked: [],
    });
    expect(k.required).toEqual(["IA", "LLM"]);
  });

  it("perfil, temas e feeds ativos derivados", () => {
    const s = resolveSettings({
      profile: {
        brandName: "Fin",
        handle: "@fin",
        network: "tiktok",
        niche: "Finanças",
      },
      colors: {
        ...defaultSettings().colors,
        accents: {
          default: "#111111",
          breaking: "#222222",
          data: "#333333",
          business: "#444444",
        },
      },
      feeds: [
        { id: "a", sourceName: "A", url: "https://a.com/f", enabled: true },
        { id: "b", sourceName: "B", url: "https://b.com/f", enabled: false },
      ],
    });
    expect(brandProfileOf(s)).toEqual({
      brandName: "Fin",
      handle: "@fin",
      networkLabel: "TikTok",
      niche: "Finanças",
    });
    // Registro antigo com `colors.accents` migra para as categorias (DEC-028).
    expect(s.categories.rules.find((r) => r.id === "data")!.accent).toBe(
      "#333333",
    );
    expect(s.categories.fallback.accent).toBe("#111111");
    expect(themesFromSettings(s)["data"]!.colors.accent).toBe("#333333");
    expect(themesFromSettings(s)["data"]!.brand).toBe("Fin");
    expect(activeFeeds(s)).toEqual([
      { id: "a", url: "https://a.com/f", sourceName: "A" },
    ]);
  });
});
