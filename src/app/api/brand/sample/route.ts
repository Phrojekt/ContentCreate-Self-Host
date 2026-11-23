import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "@/lib/errors";
import {
  buildRendererFromSettings,
  resolveFormat,
} from "@/services/publishing";
import { samplePostData } from "@/lib/brand-sample";

const querySchema = z.object({
  /** Id da categoria (DEC-028). Desconhecida → categoria padrão. */
  variant: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .default("default"),
});

export async function GET(request: Request) {
  try {
    const { variant } = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const image = await (
      await buildRendererFromSettings()
    ).render(samplePostData(variant), {
      format: resolveFormat(),
    });
    return new NextResponse(new Uint8Array(image.buffer), {
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
