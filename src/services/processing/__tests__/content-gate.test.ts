import { describe, expect, it } from "vitest";

import {
  contentLength,
  hasEnoughContent,
  MIN_CONTENT_CHARS,
} from "@/services/processing/content-gate";
import type { NewsItem } from "@/types";

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: "Notícia",
    summary: "Resumo",
    url: "https://exemplo.com",
    canonicalUrl: "https://exemplo.com",
    source: "Fonte",
    publishedAt: new Date(),
    ...overrides,
  };
}

const longText = (n: number) => "a".repeat(n);

describe("contentLength", () => {
  it("usa content quando presente (prioridade sobre summary)", () => {
    const it_ = item({ summary: "curto", content: longText(500) });
    expect(contentLength(it_)).toBe(500);
  });

  it("cai para summary quando não há content", () => {
    const it_ = item({ summary: longText(120) });
    expect(contentLength(it_)).toBe(120);
  });

  it("ignora espaços nas pontas (trim)", () => {
    const it_ = item({ summary: `   ${longText(50)}   ` });
    expect(contentLength(it_)).toBe(50);
  });
});

describe("hasEnoughContent", () => {
  it("aprova conteúdo acima do piso", () => {
    expect(
      hasEnoughContent(item({ content: longText(MIN_CONTENT_CHARS) })),
    ).toBe(true);
  });

  it("reprova conteúdo abaixo do piso", () => {
    expect(
      hasEnoughContent(item({ content: longText(MIN_CONTENT_CHARS - 1) })),
    ).toBe(false);
  });

  it("reprova resumo magro sem content", () => {
    expect(hasEnoughContent(item({ summary: "Resumo de 1 frase." }))).toBe(
      false,
    );
  });

  it("aceita piso customizado", () => {
    const it_ = item({ summary: longText(100) });
    expect(hasEnoughContent(it_, 50)).toBe(true);
    expect(hasEnoughContent(it_, 150)).toBe(false);
  });
});
