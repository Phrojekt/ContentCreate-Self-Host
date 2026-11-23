import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { resetSettings } from "@/services/settings/settings-store";

/** Restaura o padrão de fábrica (`config/`) — DEC-027. */
export async function POST() {
  try {
    return NextResponse.json({ ok: true, settings: await resetSettings() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
