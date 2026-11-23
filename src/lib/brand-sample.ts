import type { PostData, TemplateVariant } from "@/types";

/** Capa de demonstração (fixa, sem notícia real) por variante — tela Marca (UI-25). */
export function samplePostData(variant: TemplateVariant): PostData {
  return {
    shortTitle: "Exemplo de capa: a manchete do post aparece aqui",
    teaser: "Miniatura de demonstração da categoria — não é uma notícia real.",
    sourceCredit: "Content Create",
    date: "18 de novembro de 2026",
    variant,
    position: { index: 1, total: 6 },
  };
}
