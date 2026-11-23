import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Nomes que o `SchedulerPublisher` grava em `<outDir>/<draftId>/`. Só estes
 * podem ser servidos (anti path traversal — UI-14). `post.json` fica de fora
 * (metadado interno).
 */
export const EXPORTED_FILE_RE = /^(?:post|slide-\d{1,2})\.png$|^caption\.txt$/;

/** Id de rascunho seguro para compor caminho no disco (cuid / ids de teste). */
export const SAFE_DRAFT_ID_RE = /^[a-z0-9-]{8,40}$/i;

export function isSafeExportPath(draftId: string, name: string): boolean {
  return SAFE_DRAFT_ID_RE.test(draftId) && EXPORTED_FILE_RE.test(name);
}

/** Ordena slide-1, slide-2, …, slide-10 numericamente; caption por último. */
function fileOrder(name: string): number {
  if (name === "post.png") return 0;
  const m = /^slide-(\d+)\.png$/.exec(name);
  if (m) return Number(m[1]);
  return 1000;
}

/** Arquivos exportados existentes de um rascunho (vazio se a pasta não existe). */
export async function listExportedFiles(
  outDir: string,
  draftId: string,
): Promise<string[]> {
  if (!SAFE_DRAFT_ID_RE.test(draftId)) return [];
  try {
    const names = await readdir(join(outDir, draftId));
    return names
      .filter((n) => EXPORTED_FILE_RE.test(n))
      .sort((a, b) => fileOrder(a) - fileOrder(b));
  } catch {
    return [];
  }
}

/** Lê um arquivo exportado validado; `null` se inválido ou inexistente. */
export async function readExportedFile(
  outDir: string,
  draftId: string,
  name: string,
): Promise<Buffer | null> {
  if (!isSafeExportPath(draftId, name)) return null;
  try {
    return await readFile(join(outDir, draftId, name));
  } catch {
    return null;
  }
}
