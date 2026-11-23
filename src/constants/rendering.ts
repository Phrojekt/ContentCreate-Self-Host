import type { PostFormat } from "@/types";

/** Dimensões por formato (px). Instagram: quadrado 1:1 e retrato 4:5. */
export const DIMENSIONS: Record<PostFormat, { width: number; height: number }> =
  {
    square: { width: 1080, height: 1080 },
    portrait: { width: 1080, height: 1350 },
  };

export const DEFAULT_FORMAT: PostFormat = "square";

/** Limite de slides do carrossel do Instagram. */
export const CAROUSEL_MAX_SLIDES = 10;

/** Máximo de caracteres por slide de corpo (acima disso, quebra em outro slide). */
export const SLIDE_BODY_MAX_CHARS = 200;

// Guardas do prefetch da imagem de fundo (robustez — imagem ruim não quebra).
export const IMAGE_FETCH_TIMEOUT_MS = 8_000;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
