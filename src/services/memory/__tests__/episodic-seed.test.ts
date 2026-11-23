import { describe, expect, it } from "vitest";

import { episodicSeed } from "@config/episodic-seed";

describe("episodicSeed (config/episodic-seed.ts — DEC-024)", () => {
  it("tem pelo menos os dois exemplos-ouro de docs/brain/exemplos.md", () => {
    expect(episodicSeed.length).toBeGreaterThanOrEqual(2);
  });

  it("todo item tem shape válido: id/situation/example são strings não vazias", () => {
    for (const seed of episodicSeed) {
      expect(typeof seed.id).toBe("string");
      expect(seed.id.length).toBeGreaterThan(0);
      expect(typeof seed.situation).toBe("string");
      expect(seed.situation.length).toBeGreaterThan(0);
      expect(typeof seed.example).toBe("string");
      expect(seed.example.length).toBeGreaterThan(0);
      if (seed.category !== undefined) {
        expect(typeof seed.category).toBe("string");
      }
    }
  });

  it("ids são estáveis e únicos (upsert por id não pode colidir)", () => {
    const ids = episodicSeed.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("inclui o exemplo de lançamento (breaking/AIDA) e o de pesquisa (data/BAB)", () => {
    const categories = episodicSeed.map((s) => s.category);
    expect(categories).toContain("breaking");
    expect(categories).toContain("data");
  });

  it("nenhum exemplo é tratado como fonte de fato — é referência de padrão sobre notícia fictícia", () => {
    for (const seed of episodicSeed) {
      expect(seed.example).toMatch(/fictíci/i);
    }
  });
});
