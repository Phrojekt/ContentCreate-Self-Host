import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { settingsPatchSchema } from "@/lib/settings-schema";
import {
  getEffectiveSettings,
  saveSettings,
} from "@/services/settings/settings-store";

/** Configuração efetiva (DEC-027). Nada aqui é segredo. */
export async function GET() {
  try {
    return NextResponse.json({ settings: await getEffectiveSettings() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Salva uma ou mais seções (profile, colors, keywords, feeds). */
export async function PATCH(request: Request) {
  try {
    const patch = settingsPatchSchema.parse(await request.json());
    return NextResponse.json({ ok: true, settings: await saveSettings(patch) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
