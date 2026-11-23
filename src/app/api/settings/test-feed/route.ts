import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "@/lib/errors";
import { isPublicHttpUrl } from "@/lib/link-guard";
import { RssSource } from "@/services/collection";

const bodySchema = z.object({
  url: z
    .string()
    .trim()
    .max(500)
    .refine(isPublicHttpUrl, "endereço público começando com http(s)://"),
  sourceName: z.string().trim().max(80).optional(),
});

/**
 * Testa um feed antes de salvar (DEC-027): lê agora e diz quantas notícias
 * vieram e as 3 mais recentes. Não grava nada.
 */
export async function POST(request: Request) {
  try {
    const { url, sourceName } = bodySchema.parse(await request.json());
    let failure: string | null = null;
    const source = new RssSource(
      [{ id: "teste", url, sourceName: sourceName || "Teste" }],
      {
        onFeedError: (_feed, err) => {
          failure = err instanceof Error ? err.message : String(err);
        },
      },
    );
    const items = await source.collect();
    if (failure) {
      return NextResponse.json({
        ok: false,
        count: 0,
        titles: [],
        error: failure,
      });
    }
    const titles = [...items]
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 3)
      .map((i) => i.title);
    return NextResponse.json({
      ok: items.length > 0,
      count: items.length,
      titles,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
