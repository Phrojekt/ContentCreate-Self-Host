import { describe, expect, it } from "vitest";

import {
  buildSourceStats,
  sourcesFailingConsecutively,
  type SourceStat,
} from "@/services/pipeline/source-stats";

const items = (...names: string[]) => names.map((source) => ({ source }));

describe("buildSourceStats (UI-31)", () => {
  it("conta por fonte e separa artigo completo de só resumo", () => {
    const stats = buildSourceStats({
      configured: ["A", "B", "C"],
      collected: items("A", "A", "A", "B"),
      selected: items("A", "A", "B"),
      fullArticleSources: ["A"],
      draftSources: ["A", "B"],
      failedFeeds: ["C"],
    });
    expect(stats).toEqual([
      {
        source: "A",
        collected: 3,
        selected: 2,
        fullArticle: 1,
        summaryOnly: 1,
        drafts: 1,
        feedFailed: false,
      },
      {
        source: "B",
        collected: 1,
        selected: 1,
        fullArticle: 0,
        summaryOnly: 1,
        drafts: 1,
        feedFailed: false,
      },
      {
        source: "C",
        collected: 0,
        selected: 0,
        fullArticle: 0,
        summaryOnly: 0,
        drafts: 0,
        feedFailed: true,
      },
    ]);
  });

  it("fonte configurada sem itens aparece zerada", () => {
    const [s] = buildSourceStats({
      configured: ["X"],
      collected: [],
      selected: [],
      fullArticleSources: [],
      draftSources: [],
      failedFeeds: [],
    });
    expect(s).toMatchObject({ source: "X", collected: 0, feedFailed: false });
  });
});

describe("sourcesFailingConsecutively", () => {
  const run = (failed: string[]): SourceStat[] =>
    ["A", "B"].map((source) => ({
      source,
      collected: 0,
      selected: 0,
      fullArticle: 0,
      summaryOnly: 0,
      drafts: 0,
      feedFailed: failed.includes(source),
    }));

  it("só alerta quando falhou nas 3 rodadas mais recentes", () => {
    expect(
      sourcesFailingConsecutively([run(["A"]), run(["A", "B"]), run(["A"])]),
    ).toEqual(["A"]);
    expect(
      sourcesFailingConsecutively([run(["A"]), run([]), run(["A"])]),
    ).toEqual([]);
  });

  it("menos de 3 rodadas com estatística → sem alerta", () => {
    expect(sourcesFailingConsecutively([run(["A"]), [], run(["A"])])).toEqual(
      [],
    );
  });
});
