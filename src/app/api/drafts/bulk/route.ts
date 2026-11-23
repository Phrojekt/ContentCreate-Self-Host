import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "@/lib/errors";
import {
  deleteRejectedDrafts,
  outputDir,
  restoreDrafts,
} from "@/services/publishing";

const bodySchema = z.object({
  action: z.enum(["restore", "delete"]),
  ids: z.array(z.string().min(1).max(64)).min(1).max(200),
});

/**
 * Ações em lote da tela Descartados (UI-13): devolver à revisão (UI-11) ou
 * excluir de vez — só REJECTED (409 e nada muda se algum não for).
 */
export async function POST(request: Request) {
  try {
    const { action, ids } = bodySchema.parse(await request.json());
    const unique = [...new Set(ids)];
    const count =
      action === "restore"
        ? await restoreDrafts(unique)
        : await deleteRejectedDrafts(unique, { outputDir: outputDir() });
    return NextResponse.json({ ok: true, count });
  } catch (error) {
    return toErrorResponse(error);
  }
}
