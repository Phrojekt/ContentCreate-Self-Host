import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "@/lib/errors";
import { generateFromLinkOnce } from "@/services/orchestration";

const bodySchema = z.object({ url: z.string().trim().min(1).max(2048) });

/** Gera um rascunho PENDING a partir de um link (UI-33, DEC-026). Síncrono. */
export async function POST(request: Request) {
  try {
    const { url } = bodySchema.parse(await request.json());
    const result = await generateFromLinkOnce(url);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
