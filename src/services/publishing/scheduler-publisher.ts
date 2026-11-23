import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  PostPackage,
  PublishMeta,
  PublishResult,
  Publisher,
} from "@/types";

export interface SchedulerPublisherOptions {
  /** Pasta-raiz de saída; cada rascunho ganha uma subpasta com seu id. */
  outDir: string;
}

/**
 * Publisher 4A (DEC-010): NÃO posta no Instagram. Entrega o `PostPackage` numa
 * pasta de saída (imagem(ns) + `caption.txt` + `post.json`), pronto para o
 * humano subir num agendador (Buffer/Metricool/Later). Sem App Review.
 */
export class SchedulerPublisher implements Publisher {
  readonly id = "scheduler:filesystem";

  constructor(private readonly options: SchedulerPublisherOptions) {}

  async publish(pkg: PostPackage, meta: PublishMeta): Promise<PublishResult> {
    const dir = join(this.options.outDir, meta.draftId);
    mkdirSync(dir, { recursive: true });

    const files: string[] = [];
    const single = pkg.images.length === 1;
    pkg.images.forEach((image, index) => {
      const name = single ? "post.png" : `slide-${index + 1}.png`;
      const path = join(dir, name);
      writeFileSync(path, image.buffer);
      files.push(path);
    });

    const hashtagLine = pkg.hashtags.map((h) => `#${h}`).join(" ");
    const captionPath = join(dir, "caption.txt");
    writeFileSync(captionPath, `${pkg.caption}\n\n${hashtagLine}\n`, "utf8");
    files.push(captionPath);

    const metaPath = join(dir, "post.json");
    writeFileSync(
      metaPath,
      JSON.stringify(
        {
          draftId: meta.draftId,
          format: pkg.format,
          hashtags: pkg.hashtags,
          images: pkg.images.length,
          exportedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
    files.push(metaPath);

    return { target: this.id, location: dir, files };
  }
}
