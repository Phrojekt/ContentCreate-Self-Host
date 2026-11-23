import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError, toErrorResponse } from "@/lib/errors";
import { setMemoryEntryActive } from "@/services/memory";

const bodySchema = z.object({ active: z.boolean() });

/** Liga/desliga uma entrada de memória (UI-24). Não existe DELETE (DEC-020). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { active } = bodySchema.parse(await request.json());
    const found = await setMemoryEntryActive(id, active);
    if (!found) {
      throw new AppError(
        "Entrada de memória não encontrada.",
        404,
        "MEMORY_NOT_FOUND",
      );
    }
    return NextResponse.json({ ok: true, active });
  } catch (error) {
    return toErrorResponse(error);
  }
}
