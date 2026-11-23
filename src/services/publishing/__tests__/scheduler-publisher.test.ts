import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SchedulerPublisher } from "@/services/publishing/scheduler-publisher";
import type { PostImage, PostPackage } from "@/types";

function image(): PostImage {
  return {
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    width: 1080,
    height: 1080,
    format: "square",
  };
}

function pkg(over: Partial<PostPackage> = {}): PostPackage {
  return {
    images: [image()],
    caption: "Legenda do post. Fonte: Portal X",
    hashtags: ["tecnologia", "ia"],
    format: "square",
    ...over,
  };
}

describe("SchedulerPublisher", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "cc-publish-"));
  });
  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("entrega post único: post.png + caption.txt + post.json", async () => {
    const publisher = new SchedulerPublisher({ outDir });
    const result = await publisher.publish(pkg(), { draftId: "draft-1" });

    const dir = join(outDir, "draft-1");
    expect(existsSync(join(dir, "post.png"))).toBe(true);
    expect(existsSync(join(dir, "caption.txt"))).toBe(true);
    expect(existsSync(join(dir, "post.json"))).toBe(true);
    expect(result.location).toBe(dir);
    expect(result.files).toHaveLength(3);
    expect(result.target).toBe("scheduler:filesystem");
  });

  it("caption.txt contém a legenda e as hashtags com #", async () => {
    const publisher = new SchedulerPublisher({ outDir });
    await publisher.publish(pkg(), { draftId: "draft-2" });

    const caption = readFileSync(
      join(outDir, "draft-2", "caption.txt"),
      "utf8",
    );
    expect(caption).toContain("Legenda do post. Fonte: Portal X");
    expect(caption).toContain("#tecnologia #ia");
  });

  it("carrossel: nomeia slide-1.png, slide-2.png", async () => {
    const publisher = new SchedulerPublisher({ outDir });
    await publisher.publish(pkg({ images: [image(), image()] }), {
      draftId: "draft-3",
    });

    const dir = join(outDir, "draft-3");
    expect(existsSync(join(dir, "slide-1.png"))).toBe(true);
    expect(existsSync(join(dir, "slide-2.png"))).toBe(true);
    expect(existsSync(join(dir, "post.png"))).toBe(false);
  });

  it("post.json registra formato e quantidade de imagens", async () => {
    const publisher = new SchedulerPublisher({ outDir });
    await publisher.publish(pkg(), { draftId: "draft-4" });

    const meta = JSON.parse(
      readFileSync(join(outDir, "draft-4", "post.json"), "utf8"),
    ) as { format: string; images: number; hashtags: string[] };
    expect(meta.format).toBe("square");
    expect(meta.images).toBe(1);
    expect(meta.hashtags).toEqual(["tecnologia", "ia"]);
  });
});
