import { describe, expect, it } from "vitest";

import {
  allCategories,
  classifyCategory,
  defaultCategories,
  keywordMatches,
  normalizeText,
  resolveCategory,
  type CategoriesConfig,
} from "@/lib/categories";
import {
  defaultSettings,
  settingsSchema,
  themesFromSettings,
} from "@/lib/settings-schema";

const custom: CategoriesConfig = {
  fallback: { label: "GERAL", accent: "#111111" },
  rules: [
    {
      id: "cripto",
      label: "CRIPTO",
      accent: "#F7931A",
      keywords: ["bitcoin", "cripto*"],
    },
    {
      id: "juros",
      label: "JUROS",
      accent: "#22D3EE",
      keywords: ["selic", "taxa de juros"],
    },
  ],
};

describe("categorias configuráveis (DEC-028)", () => {
  it("de fábrica reproduz as categorias antigas", () => {
    const d = defaultCategories();
    expect(classifyCategory("OpenAI anuncia novo modelo", "", d)).toBe(
      "breaking",
    );
    expect(classifyCategory("Pesquisa mostra adoção de IA", "", d)).toBe(
      "data",
    );
    expect(classifyCategory("Startup capta rodada", "", d)).toBe("business");
    expect(classifyCategory("Modelo de linguagem fica menor", "", d)).toBe(
      "default",
    );
  });

  it("ordem = prioridade; padrão quando nada casa", () => {
    expect(classifyCategory("Bitcoin sobe após Selic cair", "", custom)).toBe(
      "cripto",
    );
    expect(classifyCategory("Copom mantém a Selic", "", custom)).toBe("juros");
    expect(classifyCategory("Como montar uma reserva", "", custom)).toBe(
      "default",
    );
  });

  it("ignora acento/maiúsculas, palavra inteira e prefixo com *", () => {
    const t = normalizeText("Criptomoedas e ANÁLISE de juros");
    expect(keywordMatches(t, "cripto*")).toBe(true);
    expect(keywordMatches(t, "cripto")).toBe(false);
    expect(keywordMatches(t, "analise")).toBe(true);
    expect(keywordMatches(t, "taxa de juros")).toBe(false);
    expect(
      keywordMatches(normalizeText("a taxa de juros subiu"), "Taxa de Juros"),
    ).toBe(true);
  });

  it("resolve rótulo/cor e cai na padrão para id desconhecido", () => {
    expect(resolveCategory(custom, "juros")).toEqual({
      id: "juros",
      label: "JUROS",
      accent: "#22D3EE",
    });
    expect(resolveCategory(custom, "sumiu").id).toBe("default");
    expect(allCategories(custom).map((c) => c.id)).toEqual([
      "default",
      "cripto",
      "juros",
    ]);
  });

  it("schema: rótulo vira maiúsculo; recusa id reservado, repetido e sem palavras", () => {
    const base = defaultSettings();
    const parse = (categories: unknown) =>
      settingsSchema.shape.categories.safeParse(categories);
    const ok = parse({
      ...custom,
      rules: [{ ...custom.rules[0]!, label: "cripto" }],
    });
    expect(ok.success && ok.data.rules[0]!.label).toBe("CRIPTO");
    expect(
      parse({ ...custom, rules: [{ ...custom.rules[0]!, id: "default" }] })
        .success,
    ).toBe(false);
    expect(
      parse({ ...custom, rules: [custom.rules[0], custom.rules[0]] }).success,
    ).toBe(false);
    expect(
      parse({ ...custom, rules: [{ ...custom.rules[0]!, keywords: [] }] })
        .success,
    ).toBe(false);
    expect(parse(base.categories).success).toBe(true);
  });

  it("um tema por categoria, com rótulo e cor próprios", () => {
    const themes = themesFromSettings({
      ...defaultSettings(),
      categories: custom,
    });
    expect(Object.keys(themes)).toEqual(["default", "cripto", "juros"]);
    expect(themes["cripto"]).toMatchObject({
      categoryLabel: "CRIPTO",
      colors: { accent: "#F7931A" },
    });
  });
});
