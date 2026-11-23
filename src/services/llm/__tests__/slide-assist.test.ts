import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/storage/draft-store");
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  buildSlideAssistPrompt,
  parseSlideAssist,
  SlideAssistError,
} from "@/services/llm/slide-assist";
import { OllamaLlmProvider } from "@/services/llm/ollama-provider";
import { assistSlide } from "@/services/publishing/assist-slide";
import {
  getDraftDetail,
  type DraftDetail,
} from "@/services/storage/draft-store";
import type { SlideContent } from "@/types";

const REF =
  "A empresa reduziu em 42% o custo de inferência e atende 3 mil clientes no Brasil.";
const original: SlideContent = {
  lead: "Custo menor",
  body: "A empresa conseguiu reduzir o custo de rodar modelos de linguagem em produção.",
  slideType: "context",
};

describe("buildSlideAssistPrompt (UI-34)", () => {
  it("inclui a instrução, as regras R0–R2 e o slide atual", () => {
    const p = buildSlideAssistPrompt(original, "number", {
      title: "T",
      source: "Portal",
      reference: REF,
    });
    expect(p).toContain("NÚMERO");
    expect(p).toMatch(/R0\.[\s\S]*R1\.[\s\S]*R2\./);
    expect(p).toContain(JSON.stringify(original));
    expect(p).toContain(REF);
  });
});

describe("parseSlideAssist", () => {
  it("aceita um slide de número cujo valor está na matéria", () => {
    const r = parseSlideAssist(
      'Claro! {"slideType":"stat","lead":"O corte","body":"A empresa cortou quase metade do custo de inferência no último ano.","stat":{"value":"42%","label":"menos custo de inferência"}}',
      original,
      REF,
    );
    expect(r.slide.slideType).toBe("stat");
    expect(r.slide.stat?.value).toBe("42%");
    expect(r.warnings).toEqual([]);
  });

  it("recusa número inventado (R1)", () => {
    expect(() =>
      parseSlideAssist(
        '{"slideType":"stat","lead":"x","body":"A empresa cortou o custo de inferência de modo relevante.","stat":{"value":"87%","label":"y"}}',
        original,
        REF,
      ),
    ).toThrow(/R1/);
  });

  it("recusa texto em inglês (R0)", () => {
    expect(() =>
      parseSlideAssist(
        '{"lead":"Lower cost","body":"The company has been able to reduce the cost of running these models in production with the new approach."}',
        original,
        REF,
      ),
    ).toThrow(SlideAssistError);
  });

  it("resposta sem JSON → erro claro", () => {
    expect(() => parseSlideAssist("desculpe", original, REF)).toThrow(
      /aproveitável/,
    );
  });

  it("avisa (sem bloquear) quando copia demais da matéria (R2)", () => {
    const r = parseSlideAssist(
      JSON.stringify({ lead: "Corte", body: REF }),
      original,
      REF,
    );
    expect(r.warnings[0]).toMatch(/R2/);
  });

  it("stat sem número volta ao tipo do slide original", () => {
    const r = parseSlideAssist(
      '{"slideType":"stat","lead":"Corte","body":"A empresa conseguiu baratear a operação dos modelos de linguagem.","stat":{"value":"","label":"x"}}',
      original,
      REF,
    );
    expect(r.slide.slideType).toBe("context");
    expect(r.slide.stat).toBeUndefined();
  });
});

describe("assistSlide (serviço — não grava nada)", () => {
  function detail(
    status: DraftDetail["draft"]["status"] = "PENDING",
  ): DraftDetail {
    return {
      draft: {
        id: "d1",
        status,
        shortTitle: "T",
        caption: "Legenda. Fonte: Portal",
        hashtags: [],
        slides: [original],
        newsItemId: "n1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      source: "Portal",
      imageUrl: null,
      publishedAt: new Date(),
      summary: REF,
    };
  }
  const completer = (text: string) => ({
    id: "c",
    completeJson: vi.fn().mockResolvedValue(text),
  });

  beforeEach(() => vi.resetAllMocks());

  it("usa o resumo da notícia como referência e devolve a sugestão", async () => {
    vi.mocked(getDraftDetail).mockResolvedValue(detail());
    const c = completer(
      '{"lead":"Mais barato","body":"A operação dos modelos ficou bem mais barata para a empresa."}',
    );
    const r = await assistSlide("d1", 1, "shorter", c);
    expect(c.completeJson.mock.calls[0]![0]).toContain(REF);
    expect(r.slide.lead).toBe("Mais barato");
  });

  it("sugestão recusada vira 422; rascunho não pendente vira 409; slide inexistente 400", async () => {
    vi.mocked(getDraftDetail).mockResolvedValue(detail());
    await expect(
      assistSlide(
        "d1",
        1,
        "number",
        completer(
          '{"slideType":"stat","lead":"x","body":"Um texto qualquer em português sobre o assunto.","stat":{"value":"99","label":"y"}}',
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      assistSlide("d1", 5, "rewrite", completer("{}")),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    vi.mocked(getDraftDetail).mockResolvedValue(detail("APPROVED"));
    await expect(
      assistSlide("d1", 1, "rewrite", completer("{}")),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe("OllamaLlmProvider.completeJson", () => {
  it("manda o prompt livre e devolve o texto da resposta", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { content: '{"lead":"a"}' } }), {
        status: 200,
      }),
    );
    const p = new OllamaLlmProvider({ fetchFn });
    expect(await p.completeJson("PROMPT X")).toBe('{"lead":"a"}');
    const body = JSON.parse(fetchFn.mock.calls[0]![1].body as string);
    expect(body.messages[0].content).toBe("PROMPT X");
    expect(body.format).toBe("json");
  });
});
