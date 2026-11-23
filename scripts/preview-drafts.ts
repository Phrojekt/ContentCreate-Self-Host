// Renderiza TODOS os rascunhos pendentes para uma pasta, para inspeção visual.
// Cada post vira uma subpasta com a imagem + caption.txt (legenda + hashtags)
// + post.json. NÃO aprova nem publica nada — o status continua PENDING (DEC-011).
//
//   npm run preview:drafts
//
// Saída: ./output/preview/<draftId>/  (abra no explorador de arquivos)

import "dotenv/config";

async function main() {
  const { listPendingDrafts } =
    await import("../src/services/storage/draft-store.js");
  const { previewDraft, SchedulerPublisher, buildDefaultRenderer } =
    await import("../src/services/publishing/index.js");
  const { join } = await import("node:path");

  const drafts = await listPendingDrafts();
  if (drafts.length === 0) {
    console.log(
      "Nenhum rascunho PENDING. Rode `npm run pipeline:run` primeiro.",
    );
    return;
  }

  const outDir = join("./output", "preview");
  const renderer = buildDefaultRenderer();
  const publisher = new SchedulerPublisher({ outDir });

  console.log(`Gerando preview de ${drafts.length} rascunho(s) em ${outDir}\n`);

  let ok = 0;
  for (const [i, draft] of drafts.entries()) {
    const label = `[${i + 1}/${drafts.length}] ${draft.shortTitle}`;
    try {
      const result = await previewDraft(draft.id, { renderer, publisher });
      ok++;
      console.log(`✓ ${label}\n    → ${result.location}`);
    } catch (err) {
      console.error(
        `✗ ${label}\n    erro: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(
    `\nPreview concluído: ${ok}/${drafts.length} gerados. Abra ${outDir} para ver os posts.`,
  );
}

main().catch((err: unknown) => {
  console.error(
    "Falha ao gerar previews:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
