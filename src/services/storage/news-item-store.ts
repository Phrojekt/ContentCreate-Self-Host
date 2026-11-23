import type { NewsItem as DbNewsItem } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { NewsItem } from "@/types";

/** Persiste (ou ignora se já existe) uma notícia. Devolve o registro do banco. */
export async function saveNewsItem(item: NewsItem): Promise<DbNewsItem> {
  return prisma.newsItem.upsert({
    where: { canonicalUrl: item.canonicalUrl },
    update: {},
    create: {
      title: item.title,
      summary: item.summary,
      url: item.url,
      canonicalUrl: item.canonicalUrl,
      source: item.source,
      publishedAt: item.publishedAt,
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    },
  });
}

/** Filtra os itens cujas URLs canônicas já foram processadas em rodadas anteriores. */
export async function filterAlreadyProcessed(
  items: NewsItem[],
): Promise<NewsItem[]> {
  if (items.length === 0) return [];
  const urls = items.map((i) => i.canonicalUrl);
  const processed = await prisma.processedUrl.findMany({
    where: { canonicalUrl: { in: urls } },
    select: { canonicalUrl: true },
  });
  const processedSet = new Set(processed.map((p) => p.canonicalUrl));
  return items.filter((i) => !processedSet.has(i.canonicalUrl));
}

/** Marca os itens como processados para não repetir em rodadas futuras. */
export async function markAsProcessed(items: NewsItem[]): Promise<void> {
  for (const item of items) {
    await prisma.processedUrl.upsert({
      where: { canonicalUrl: item.canonicalUrl },
      update: {},
      create: { canonicalUrl: item.canonicalUrl },
    });
  }
}
