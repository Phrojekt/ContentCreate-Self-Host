import { describe, expect, it } from "vitest";

import {
  clusterByEmbedding,
  cosineSimilarity,
  deduplicateByEmbedding,
} from "@/services/processing/semantic-dedup";

describe("cosineSimilarity", () => {
  it("retorna 1 para vetores idênticos", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("retorna 0 para vetores ortogonais", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("retorna 1 para vetores paralelos (mesma direção, escalas diferentes)", () => {
    expect(cosineSimilarity([1, 1], [2, 2])).toBeCloseTo(1);
  });

  it("retorna 0 quando algum vetor é nulo (evita divisão por zero)", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("deduplicateByEmbedding", () => {
  it("remove o segundo de um par quase idêntico (cosseno ≥ threshold)", () => {
    const items = ["a", "b", "c"];
    const vectors = [
      [1, 0, 0],
      [0.99, 0.01, 0], // quase igual a "a"
      [0, 1, 0], // distinto
    ];
    expect(deduplicateByEmbedding(items, vectors, 0.9)).toEqual(["a", "c"]);
  });

  it("preserva o primeiro de cada grupo (greedy)", () => {
    const items = ["primeiro", "dup-do-primeiro"];
    const vectors = [
      [1, 1],
      [1, 1],
    ];
    expect(deduplicateByEmbedding(items, vectors, 0.95)).toEqual(["primeiro"]);
  });

  it("não remove nada quando todos são distintos", () => {
    const items = ["x", "y", "z"];
    const vectors = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    expect(deduplicateByEmbedding(items, vectors, 0.8)).toEqual([
      "x",
      "y",
      "z",
    ]);
  });

  it("ignora itens sem vetor correspondente", () => {
    const items = ["a", "b"];
    const vectors = [[1, 0]]; // falta o vetor de "b"
    expect(deduplicateByEmbedding(items, vectors, 0.9)).toEqual(["a"]);
  });
});

describe("clusterByEmbedding", () => {
  it("agrupa quase-duplicados em vez de descartar (DEC-019)", () => {
    const items = ["a", "b-quase-igual-a-a", "c"];
    const vectors = [
      [1, 0, 0],
      [0.99, 0.01, 0],
      [0, 1, 0],
    ];
    expect(clusterByEmbedding(items, vectors, 0.9)).toEqual([
      ["a", "b-quase-igual-a-a"],
      ["c"],
    ]);
  });

  it("nenhum duplicado → cada item vira seu próprio grupo", () => {
    const items = ["x", "y", "z"];
    const vectors = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    expect(clusterByEmbedding(items, vectors, 0.8)).toEqual([
      ["x"],
      ["y"],
      ["z"],
    ]);
  });

  it("três fontes da mesma notícia viram um único grupo de três", () => {
    const items = ["fonte-a", "fonte-b", "fonte-c"];
    const vectors = [
      [1, 0],
      [0.98, 0.02],
      [0.97, 0.03],
    ];
    const clusters = clusterByEmbedding(items, vectors, 0.9);
    expect(clusters).toEqual([["fonte-a", "fonte-b", "fonte-c"]]);
  });

  it("ignora itens sem vetor correspondente", () => {
    const items = ["a", "b"];
    const vectors = [[1, 0]];
    expect(clusterByEmbedding(items, vectors, 0.9)).toEqual([["a"]]);
  });
});
