import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { runPipelineOnce } from "@/services/orchestration";

/** Dispara manualmente uma rodada orquestrada da esteira (com notificação). */
export async function POST() {
  try {
    const outcome = await runPipelineOnce();
    return NextResponse.json({ ok: outcome.ok, outcome });
  } catch (error) {
    return toErrorResponse(error);
  }
}
