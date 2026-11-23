import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "@/lib/errors";
import { listMemoryEntries } from "@/services/memory";

const querySchema = z.object({
  source: z
    .enum(["MANUAL", "FEEDBACK_APPROVED", "FEEDBACK_REJECTED"])
    .optional(),
  active: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** Lista a Memória (UI-24) — sem a coluna `embedding`. */
export async function GET(request: Request) {
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const q = querySchema.parse(params);
    const entries = await listMemoryEntries({
      ...(q.source ? { source: q.source } : {}),
      ...(q.active ? { active: q.active === "true" } : {}),
      ...(q.limit ? { limit: q.limit } : {}),
    });
    return NextResponse.json({ entries });
  } catch (error) {
    return toErrorResponse(error);
  }
}
