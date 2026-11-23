import { QUALITY_MIN_SCORE } from "@/constants/quality";
import { looksLikeEnglish } from "./language-check";
import { copyOverlapRatio } from "./originality-check";
import type { ContentTarget } from "./content-target";
import type { LlmOutput } from "./llm-provider";
import type { SlideContent } from "@/types";

export interface ScoreBreakdown {
  slideCount: number; // 15 pts
  leadQuality: number; // 20 pts
  bodyLength: number; // 20 pts
  lastSlide: number; // 20 pts (15 CTA + 5 pergunta)
  caption: number; // 10 pts (5 fonte + 5 min chars)
  hashtags: number; // 5 pts
  shortTitle: number; // 5 pts (não vazio e ≤ 12 palavras)
  language: number; // 20 pts (R0 — vazamento de inglês)
  originality: number; // 15 pts (R2 — cópia literal da fonte)
  archetypeVariety: number; // 10 pts (brand guide sec 8 — arquétipos variados)
}

export interface ScoreResult {
  total: number;
  passed: boolean;
  breakdown: ScoreBreakdown;
  /** Descrição legível de cada critério violado — para log e debug. */
  violations: string[];
}

/**
 * Leads proibidos: nomes de slots (antigos e novos formatos) e genéricos vazios.
 * Comparação case-insensitive sem pontuação.
 */
const BANNED_LEADS = new Set([
  // Nomes de slots antigos (formato SLOT N: NOME)
  "fato central",
  "causa e contexto",
  "impacto prático",
  "impacto pratico",
  "debate e cta",
  "dado de suporte",
  "aprofundamento",
  // Frases do novo formato de header (verbo + complemento)
  "apresente o fato central",
  "explique por que aconteceu",
  "mostre o impacto prático",
  "mostre o impacto pratico",
  "encerre com debate e cta",
  "ancore com um dado de suporte",
  "aprofunde com ângulos diferentes",
  "aprofunde com angulos diferentes",
  // Genéricos de uma palavra que não informam nada
  "inovação",
  "inovacao",
  "tecnologia",
  "resumo",
  "conclusão",
  "conclusao",
  "informação",
  "informacao",
  "destaque",
  "atenção",
  "atencao",
  "importante",
  "contexto",
  "introdução",
  "introducao",
  "intro",
  "novidade",
  "notícia",
  "noticia",
  "saiba mais",
]);

function normalizeForBanCheck(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,!?:;]/g, "")
    .trim();
}

/**
 * Unidades de texto "de voz humana" gerado, avaliadas SEPARADAMENTE (não como
 * um único blob) pelos gates de idioma e originalidade — um único slide
 * vazando inglês ou copiado da fonte não pode se diluir na média de um
 * carrossel de 4-9 slides e escapar do gate.
 */
function collectTextUnits(
  output: LlmOutput,
): { label: string; text: string }[] {
  const units: { label: string; text: string }[] = [];
  if (output.shortTitle?.trim()) {
    units.push({ label: "shortTitle", text: output.shortTitle });
  }
  if (output.caption?.trim()) {
    units.push({ label: "caption", text: output.caption });
  }
  (output.slides ?? []).forEach((s, i) => {
    const text = [
      s.lead,
      s.body,
      s.eyebrow,
      s.stat?.label,
      s.stat?.supporting,
      s.comparison?.leftDetail,
      s.comparison?.rightDetail,
      s.quote?.text,
    ]
      .filter(Boolean)
      .join(" ");
    if (text.trim()) units.push({ label: `slide ${i + 1}`, text });
  });
  return units;
}

/** Arquétipo efetivo do slide para fins de checagem de variedade — mesmo fallback de `resolveArchetype` no template. */
function effectiveSlideType(slide: SlideContent, isLast: boolean): string {
  if (slide.slideType) return slide.slideType;
  return isLast ? "closing" : "context";
}

/**
 * Pontua um `LlmOutput` contra os critérios do prompt (100 pontos).
 * Função pura — sem I/O, sem efeitos colaterais.
 *
 * `sourceText`, quando informado, habilita o gate de originalidade (R2) —
 * compara o texto gerado contra o texto-fonte por sobreposição de shingles.
 * Sem `sourceText`, esse gate é pulado (pontuação plena, sem penalidade —
 * nunca puna por falta de dado que o chamador não tinha).
 *
 * Threshold de aprovação: 90 pontos. `language` e `originality` reprovados
 * aplicam um teto rígido no total (`hardCap`) — não são pontos que outras
 * dimensões possam compensar, porque R0/R2 são regras não-negociáveis do
 * prompt: um post em inglês ou copiado da fonte não "passa" só por ter CTA e
 * hashtags corretos.
 */
export function scoreOutput(
  output: LlmOutput,
  target: ContentTarget,
  handle: string,
  sourceText?: string,
): ScoreResult {
  const violations: string[] = [];
  const slides = output.slides ?? [];
  let hardCap = 100;

  // ─── 1. Contagem de slides (15 pts) ───────────────────────────────────────
  let slideCount = 0;
  if (slides.length === target.slideCount) {
    slideCount = 15;
  } else {
    violations.push(
      `Slides: esperado ${target.slideCount}, obtido ${slides.length}`,
    );
  }

  // ─── 2. Qualidade dos leads (20 pts) ──────────────────────────────────────
  // Penalidade proporcional ao número de slides para não punir mais em carrosséis longos.
  const leadPtsPerViolation = slides.length > 0 ? 20 / slides.length : 20;
  // Sem slides não há como ganhar pontos de lead ou body — começa em 0.
  let leadQuality = slides.length > 0 ? 20 : 0;
  for (let i = 0; i < slides.length; i++) {
    const lead = (slides[i]?.lead ?? "").trim();
    if (!lead) {
      leadQuality -= leadPtsPerViolation;
      violations.push(`Slide ${i + 1}: lead vazio`);
    } else if (BANNED_LEADS.has(normalizeForBanCheck(lead))) {
      leadQuality -= leadPtsPerViolation;
      violations.push(`Slide ${i + 1}: lead proibido — "${lead}"`);
    }
  }
  leadQuality = Math.max(0, Math.round(leadQuality));

  // ─── 3. Tamanho dos bodies (20 pts) ───────────────────────────────────────
  const bodyPtsPerViolation = slides.length > 0 ? 20 / slides.length : 20;
  let bodyLength = slides.length > 0 ? 20 : 0;
  for (let i = 0; i < slides.length; i++) {
    const body = (slides[i]?.body ?? "").trim();
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    if (wordCount < target.minWordsPerSlide) {
      bodyLength -= bodyPtsPerViolation;
      violations.push(
        `Slide ${i + 1}: body com ${wordCount} palavras (mínimo: ${target.minWordsPerSlide})`,
      );
    }
  }
  bodyLength = Math.max(0, Math.round(bodyLength));

  // ─── 4. Último slide: CTA (15 pts) + pergunta de engajamento (5 pts) ──────
  const lastSlide = slides[slides.length - 1];
  const lastBody = (lastSlide?.body ?? "").toLowerCase();
  let lastSlideScore = 0;

  const handleNorm = handle.toLowerCase().replace(/^@/, "");
  if (
    lastBody.includes(handleNorm) ||
    lastBody.includes(handle.toLowerCase())
  ) {
    lastSlideScore += 15;
  } else {
    violations.push(`Último slide: CTA com "${handle}" ausente`);
  }
  if (lastBody.includes("?")) {
    lastSlideScore += 5;
  } else {
    violations.push("Último slide: pergunta de engajamento ausente");
  }

  // ─── 5. Caption (10 pts) ──────────────────────────────────────────────────
  let caption = 0;
  const captionText = output.caption ?? "";
  if (/fonte:/i.test(captionText)) {
    caption += 5;
  } else {
    violations.push('Caption: atribuição "Fonte:" ausente');
  }
  if (captionText.length >= target.captionMinChars) {
    caption += 5;
  } else {
    violations.push(
      `Caption: ${captionText.length} chars (mínimo: ${target.captionMinChars})`,
    );
  }

  // ─── 6. Hashtags (5 pts) ──────────────────────────────────────────────────
  const hashCount = (output.hashtags ?? []).length;
  let hashtags = 0;
  if (hashCount >= 5 && hashCount <= 8) {
    hashtags = 5;
  } else {
    violations.push(`Hashtags: ${hashCount} (esperado: 5–8)`);
  }

  // ─── 7. shortTitle (5 pts) ────────────────────────────────────────────────
  let shortTitle = 0;
  const titleText = (output.shortTitle ?? "").trim();
  if (!titleText) {
    violations.push("shortTitle: vazio");
  } else if (titleText.split(/\s+/).length > 12) {
    violations.push(
      `shortTitle: ${titleText.split(/\s+/).length} palavras (máx: 12)`,
    );
  } else {
    shortTitle = 5;
  }

  // Unidades avaliadas SEPARADAMENTE (shortTitle, caption, cada slide) — um
  // único slide vazando inglês ou copiado da fonte não pode se diluir na
  // média de um carrossel de 4-9 slides e escapar do gate (ver docstring de
  // `collectTextUnits`).
  const textUnits = collectTextUnits(output);

  // ─── 8. Idioma PT-BR (20 pts, R0) — gate rígido ───────────────────────────
  // Não é ponto que outra dimensão compensa: inglês vazando é reprovação, ponto.
  let language = 20;
  const englishUnits = textUnits.filter((u) => looksLikeEnglish(u.text));
  if (englishUnits.length > 0) {
    language = 0;
    hardCap = Math.min(hardCap, 40);
    violations.push(
      `R0 violado: conteúdo em inglês detectado em ${englishUnits.map((u) => u.label).join(", ")} — marcadores fortes de inglês encontrados`,
    );
  }

  // ─── 9. Originalidade (15 pts, R2) — gate rígido quando há sourceText ─────
  let originality = 15;
  if (sourceText) {
    const overlaps = textUnits.map((u) => ({
      label: u.label,
      ratio: copyOverlapRatio(u.text, sourceText),
    }));
    const worst = overlaps.reduce((a, b) => (b.ratio > a.ratio ? b : a), {
      label: "",
      ratio: 0,
    });
    if (worst.ratio > 0.25) {
      originality = 0;
      hardCap = Math.min(hardCap, 50);
      violations.push(
        `R2 violado em ${worst.label}: ${Math.round(worst.ratio * 100)}% do texto é cópia literal (trechos de 8 palavras idênticos) da fonte — reescreva com palavras próprias, de forma didática`,
      );
    } else if (worst.ratio > 0.1) {
      originality = 7;
      violations.push(
        `R2 em risco em ${worst.label}: ${Math.round(worst.ratio * 100)}% do texto repete trechos literais da fonte — parafraseie mais`,
      );
    }
  }

  // ─── 10. Variedade de arquétipo (10 pts, brand guide sec 8) ───────────────
  let archetypeVariety = 10;
  if (slides.length > 0) {
    const types = slides.map((s, i) =>
      effectiveSlideType(s, i === slides.length - 1),
    );
    let run = 1;
    let hasRepeat = false;
    for (let i = 1; i < types.length; i++) {
      run = types[i] === types[i - 1] ? run + 1 : 1;
      if (run > 2) hasRepeat = true;
    }
    if (hasRepeat) {
      archetypeVariety -= 6;
      violations.push(
        "Arquétipo repetido mais de 2 vezes seguidas (brand guide sec 8) — varie contexto/estatística/comparação/citação",
      );
    }

    const richTypes = new Set(["stat", "comparison", "quote"]);
    const hasRichArchetype = types.some((t) => richTypes.has(t));
    if (target.slideCount >= 4 && !hasRichArchetype) {
      archetypeVariety -= 4;
      violations.push(
        "Nenhum arquétipo rico (estatística/comparação/citação) usado apesar do carrossel ter espaço para isso",
      );
    }
    archetypeVariety = Math.max(0, archetypeVariety);
  }

  const rawTotal =
    slideCount +
    leadQuality +
    bodyLength +
    lastSlideScore +
    caption +
    hashtags +
    shortTitle +
    language +
    originality +
    archetypeVariety;
  const total = Math.min(100, hardCap, rawTotal);

  return {
    total,
    passed: total >= QUALITY_MIN_SCORE,
    breakdown: {
      slideCount,
      leadQuality,
      bodyLength,
      lastSlide: lastSlideScore,
      caption,
      hashtags,
      shortTitle,
      language,
      originality,
      archetypeVariety,
    },
    violations,
  };
}
