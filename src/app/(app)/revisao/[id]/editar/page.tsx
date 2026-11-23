import { projectConfig } from "@config/project.config";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DraftEditor } from "@/components/editor/draft-editor";
import { DIMENSIONS } from "@/constants/rendering";
import { resolveCategory } from "@/lib/categories";
import { formatDateTime } from "@/lib/format";
import {
  buildDraftSlides,
  normalizeArchetypes,
  resolveFormat,
} from "@/services/publishing";
import { getEffectiveSettings } from "@/services/settings/settings-store";
import { getDraftDetail } from "@/services/storage/draft-store";

export const dynamic = "force-dynamic";

export default async function EditarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getDraftDetail(id);
  if (!detail) notFound();

  if (detail.draft.status !== "PENDING") {
    return (
      <main className="px-5 pt-7 md:px-10">
        <div className="mx-auto flex max-w-[720px] flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
          <h1 className="m-0 text-xl font-bold">
            Este rascunho não pode ser editado
          </h1>
          <p className="m-0 text-sm text-muted">
            Só rascunhos pendentes podem ser editados — este já foi decidido.
          </p>
          <Link href="/revisao" className="text-sm font-medium">
            Voltar à Revisão
          </Link>
        </div>
      </main>
    );
  }

  const format = resolveFormat();
  const { categories } = await getEffectiveSettings();
  const variant = buildDraftSlides(detail, categories)[0]?.variant ?? "default";
  const category = resolveCategory(categories, variant);
  // O carrossel só usa os slides do LLM quando eles existem; sem eles, o corpo
  // sai da legenda (não há slides para editar um a um).
  const hasSlides =
    projectConfig.post.carousel.enabled && detail.draft.slides.length > 0;

  return (
    <DraftEditor
      id={id}
      initial={{
        shortTitle: detail.draft.shortTitle,
        caption: detail.draft.caption,
        hashtags: detail.draft.hashtags,
        // Mostra o arquétipo efetivo (o mesmo que o template desenha).
        slides: normalizeArchetypes(detail.draft.slides).slides,
      }}
      hasSlides={hasSlides}
      source={detail.source}
      createdLabel={formatDateTime(detail.draft.createdAt)}
      editedLabel={
        detail.draft.editedAt ? formatDateTime(detail.draft.editedAt) : null
      }
      variantLabel={category.label}
      accent={category.accent}
      width={DIMENSIONS[format].width}
      height={DIMENSIONS[format].height}
    />
  );
}
