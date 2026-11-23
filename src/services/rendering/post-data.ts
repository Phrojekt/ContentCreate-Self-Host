import { projectConfig } from "@config/project.config";
import { CAROUSEL_MAX_SLIDES, DEFAULT_FORMAT } from "@/constants/rendering";
import { AppError } from "@/lib/errors";
import type { PostData, PostFormat, PostPackage, PostRenderer } from "@/types";

export interface BuildPostDataInput {
  shortTitle: string;
  sourceCredit: string;
  date?: Date;
  backgroundImageUrl?: string;
  /** Locale para formatar a data (default: idioma do tema). */
  locale?: string;
}

/**
 * Constrói `PostData` (entrada do template) a partir de campos já reescritos.
 * Função pura: formata a data e repassa só o que o layout precisa.
 */
export function buildPostData(input: BuildPostDataInput): PostData {
  const locale = input.locale ?? projectConfig.theme.language;
  const date = formatDate(input.date ?? new Date(), locale);

  const data: PostData = {
    shortTitle: input.shortTitle,
    sourceCredit: input.sourceCredit,
    date,
  };
  const bg = input.backgroundImageUrl?.trim();
  return bg ? { ...data, backgroundImageUrl: bg } : data;
}

function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export interface RenderPackageMeta {
  caption: string;
  hashtags: string[];
  format?: PostFormat;
}

/**
 * Renderiza 1 (post único) ou N (carrossel, até 10) slides e monta o
 * `PostPackage` final com legenda e hashtags. Nada é publicado (DEC-011).
 */
export async function renderPostPackage(
  renderer: PostRenderer,
  slides: PostData[],
  meta: RenderPackageMeta,
): Promise<PostPackage> {
  if (slides.length === 0) {
    throw new AppError(
      "Nenhum slide para renderizar.",
      400,
      "RENDER_NO_SLIDES",
    );
  }
  if (slides.length > CAROUSEL_MAX_SLIDES) {
    throw new AppError(
      `Carrossel excede o limite de ${CAROUSEL_MAX_SLIDES} slides.`,
      400,
      "RENDER_TOO_MANY_SLIDES",
    );
  }

  const format = meta.format ?? DEFAULT_FORMAT;
  const images = [];
  for (const slide of slides) {
    images.push(await renderer.render(slide, { format }));
  }

  return {
    images,
    caption: meta.caption,
    hashtags: meta.hashtags,
    format,
  };
}
