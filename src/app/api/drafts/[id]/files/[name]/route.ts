import { NextResponse } from "next/server";

import { AppError, toErrorResponse } from "@/lib/errors";
import {
  isSafeExportPath,
  outputDir,
  readExportedFile,
} from "@/services/publishing";

/**
 * Serve um arquivo do pacote exportado (`PUBLISH_OUTPUT_DIR/<id>/<name>`) para
 * a Agenda (UI-14). Só nomes do padrão do publisher (`post.png`,
 * `slide-N.png`, `caption.txt`) e ids seguros — anti path traversal.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; name: string }> },
) {
  try {
    const { id, name } = await context.params;
    if (!isSafeExportPath(id, name)) {
      throw new AppError("Arquivo inválido.", 400, "INVALID_FILE");
    }
    const data = await readExportedFile(outputDir(), id, name);
    if (!data) {
      throw new AppError("Arquivo não encontrado.", 404, "FILE_NOT_FOUND");
    }
    const isPng = name.endsWith(".png");
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "content-type": isPng ? "image/png" : "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${id}-${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
