import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockedFunction } from "vitest";

// Mocks — hoistados pelo vitest, substituem os módulos antes de qualquer import
vi.mock("@/services/collection");
vi.mock("@/services/storage/news-item-store");
vi.mock("@/services/storage/draft-store");
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { collect } from "@/services/collection";
import {
  filterAlreadyProcessed,
  markAsProcessed,
  saveNewsItem,
} from "@/services/storage/news-item-store";
import { saveDraft } from "@/services/storage/draft-store";
import { runPipeline } from "@/services/pipeline/pipeline";
import type { LlmOutput, LlmProvider } from "@/services/llm/llm-provider";
import type { NewsItem } from "@/types";

// Summary acima do piso de 300 chars (passa no gate de conteúdo por padrão).
const RICH_SUMMARY =
  "Pesquisadores apresentam avanços em machine learning e inteligência artificial aplicada a business intelligence. " +
  "O estudo detalha como modelos de linguagem processam grandes volumes de dados corporativos para gerar dashboards " +
  "automáticos, reduzindo o tempo de análise de horas para minutos. Segundo os autores, a técnica foi validada em " +
  "três empresas do setor financeiro com ganhos mensuráveis de produtividade.";

function newsItem(
  url = "https://exemplo.com/1",
  title = "Modelo de linguagem avança em análise de dados com IA",
  summary = RICH_SUMMARY,
): NewsItem {
  return {
    title,
    summary,
    url,
    canonicalUrl: url,
    source: "Portal Teste",
    publishedAt: new Date(), // recente — passa no filtro de recência
  };
}

interface MockLlm extends LlmProvider {
  summarize: MockedFunction<(item: NewsItem) => Promise<LlmOutput>>;
}

function mockLlm(): MockLlm {
  return {
    id: "mock",
    summarize: vi.fn().mockResolvedValue({
      shortTitle: "Título Curto",
      caption: "Legenda completa do post. Fonte: Portal Teste",
      hashtags: ["teste", "conteudo"],
    } satisfies LlmOutput),
  };
}

describe("runPipeline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Defaults: storage passa os itens sem modificar e é no-op
    vi.mocked(
      filterAlreadyProcessed as MockedFunction<typeof filterAlreadyProcessed>,
    ).mockImplementation(async (items) => items);
    vi.mocked(
      saveNewsItem as MockedFunction<typeof saveNewsItem>,
    ).mockImplementation(async (item) => ({
      id: "db-id",
      ...item,
      imageUrl: item.imageUrl ?? null,
      collectedAt: new Date(),
    }));
    vi.mocked(
      markAsProcessed as MockedFunction<typeof markAsProcessed>,
    ).mockResolvedValue(undefined);
    vi.mocked(saveDraft as MockedFunction<typeof saveDraft>).mockResolvedValue(
      undefined,
    );
  });

  it("cria rascunhos para itens coletados e retorna resultado correto", async () => {
    vi.mocked(collect as MockedFunction<typeof collect>).mockResolvedValue({
      items: [
        newsItem(
          "https://a.com",
          "GPT-5 supera benchmarks em raciocínio e análise de dados",
        ),
        newsItem(
          "https://b.com",
          "Power BI integra LLM para geração automática de dashboards de business intelligence",
        ),
      ],
      bySource: { "Portal Teste": 2 },
      errors: [],
    });

    const result = await runPipeline(mockLlm());

    expect(result.collected).toBe(2);
    expect(result.draftsCreated).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(markAsProcessed).toHaveBeenCalledTimes(1);
  });

  it("DEC-027: coleta os feeds e filtra pelas palavras salvos na UI", async () => {
    vi.mocked(collect as MockedFunction<typeof collect>).mockResolvedValue({
      items: [
        newsItem(
          "https://a.com",
          "Tesouro Direto bate recorde de investidores",
        ),
        newsItem("https://b.com", "GPT-5 supera benchmarks em raciocínio"),
      ],
      bySource: {},
      errors: [],
    });
    const feeds = [
      { id: "fin", url: "https://fin.com/rss", sourceName: "Fin" },
    ];

    const result = await runPipeline(mockLlm(), {
      feeds,
      keywords: { required: ["tesouro direto"], blocked: [] },
    });

    expect(vi.mocked(collect).mock.calls[0]![0]).toMatchObject({ feeds });
    expect(result.afterFilter).toBe(1);
    expect(result.sourceStats!.some((s) => s.source === "Fin")).toBe(true);
  });

  it("UI-20/UI-31: liga rascunhos à rodada e devolve saúde por fonte", async () => {
    vi.mocked(collect as MockedFunction<typeof collect>).mockImplementation(
      async (hooks) => {
        hooks?.onFeedFailed?.("Feed Quebrado");
        return {
          items: [
            newsItem(
              "https://a.com",
              "GPT-5 supera benchmarks em raciocínio e análise de dados",
            ),
          ],
          bySource: { "Portal Teste": 1 },
          errors: [],
        };
      },
    );

    const result = await runPipeline(mockLlm(), { pipelineRunId: "run-9" });

    expect(vi.mocked(saveDraft).mock.calls[0]![0]).toMatchObject({
      pipelineRunId: "run-9",
    });
    const portal = result.sourceStats!.find((s) => s.source === "Portal Teste");
    expect(portal).toMatchObject({ collected: 1, selected: 1, drafts: 1 });
    const broken = result.sourceStats!.find(
      (s) => s.source === "Feed Quebrado",
    );
    expect(broken?.feedFailed).toBe(true);
  });

  it("retorna zeros quando não há itens coletados", async () => {
    vi.mocked(collect as MockedFunction<typeof collect>).mockResolvedValue({
      items: [],
      bySource: {},
      errors: [],
    });

    const result = await runPipeline(mockLlm());

    expect(result.collected).toBe(0);
    expect(result.draftsCreated).toBe(0);
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("isola falha do LLM e continua com os demais itens", async () => {
    vi.mocked(collect as MockedFunction<typeof collect>).mockResolvedValue({
      items: [
        newsItem(
          "https://ok.com",
          "Claude 4 apresenta avanços em raciocínio de machine learning",
        ),
        newsItem(
          "https://fail.com",
          "Databricks lança nova versão com suporte a LLM e inteligência artificial",
        ),
      ],
      bySource: {},
      errors: [],
    });

    const llm = mockLlm();
    llm.summarize
      .mockResolvedValueOnce({
        shortTitle: "OK",
        caption: "Legenda OK. Fonte: X",
        hashtags: [],
      })
      .mockRejectedValueOnce(new Error("LLM indisponível"));

    const result = await runPipeline(llm);

    expect(result.draftsCreated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/LLM indisponível/);
  });

  it("registra erros de coleta no resultado e ainda processa o que foi coletado", async () => {
    vi.mocked(collect as MockedFunction<typeof collect>).mockResolvedValue({
      items: [newsItem()],
      bySource: {},
      errors: [{ sourceId: "rss", error: new Error("Timeout ao conectar") }],
    });

    const result = await runPipeline(mockLlm());

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/rss/);
    expect(result.draftsCreated).toBe(1); // ainda processou o item coletado
  });

  it("dedup semântica remove item duplicado quando há embedder", async () => {
    vi.mocked(collect as MockedFunction<typeof collect>).mockResolvedValue({
      items: [
        newsItem("https://feed-a.com", "GPT-5 chega ao Brasil com novidades"),
        newsItem(
          "https://feed-b.com",
          "Modelo GPT-5 lançado no país pela OpenAI",
        ),
      ],
      bySource: {},
      errors: [],
    });

    // Vetores idênticos → cosseno 1 → o segundo é considerado duplicado.
    const embedder = {
      id: "fake-embed",
      embed: vi.fn().mockResolvedValue([
        [1, 0, 0],
        [1, 0, 0],
      ]),
    };

    const result = await runPipeline(mockLlm(), { embedder });

    expect(embedder.embed).toHaveBeenCalledOnce();
    expect(result.afterSemantic).toBe(1);
    expect(result.draftsCreated).toBe(1);
  });

  it("dedup semântica anexa a fonte-irmã como corroboração em vez de descartá-la (DEC-019)", async () => {
    vi.mocked(collect as MockedFunction<typeof collect>).mockResolvedValue({
      items: [
        newsItem("https://feed-a.com", "GPT-5 chega ao Brasil com novidades"),
        newsItem(
          "https://feed-b.com",
          "Modelo GPT-5 lançado no país pela OpenAI",
          "Resumo da fonte B sobre o mesmo lançamento, com detalhes complementares sobre o GPT-5 no Brasil.",
        ),
      ],
      bySource: {},
      errors: [],
    });

    const embedder = {
      id: "fake-embed",
      embed: vi.fn().mockResolvedValue([
        [1, 0, 0],
        [1, 0, 0],
      ]),
    };

    const llm = mockLlm();
    const result = await runPipeline(llm, { embedder });

    expect(result.afterSemantic).toBe(1);
    expect(result.draftsCreated).toBe(1);
    const receivedItem = llm.summarize.mock.calls[0]![0];
    expect(receivedItem.corroboratingSources).toHaveLength(1);
    expect(receivedItem.corroboratingSources?.[0]?.source).toBe("Portal Teste");
    expect(receivedItem.corroboratingSources?.[0]?.text).toMatch(/fonte B/);
  });

  it("descarta item com conteúdo magro antes do LLM (gate anti-alucinação)", async () => {
    vi.mocked(collect as MockedFunction<typeof collect>).mockResolvedValue({
      items: [
        // Summary curtíssimo (< 300 chars), sem extractor → continua magro.
        // Título com keyword real ("LLM") p/ passar no filtro e chegar ao gate.
        newsItem("https://magro.com", "LLM lança novidade", "Resumo curto."),
      ],
      bySource: {},
      errors: [],
    });

    const llm = mockLlm();
    const result = await runPipeline(llm);

    expect(result.selected).toBe(1);
    expect(result.skippedThinContent).toBe(1);
    expect(result.draftsCreated).toBe(0);
    expect(llm.summarize).not.toHaveBeenCalled(); // nunca chega no LLM
    expect(saveDraft).not.toHaveBeenCalled();
    // Mesmo descartado, é marcado como processado (não re-buscar toda rodada).
    expect(markAsProcessed).toHaveBeenCalledTimes(1);
    const marked = vi.mocked(markAsProcessed).mock.calls[0]![0];
    expect(marked).toHaveLength(1);
  });

  it("processa o rico e descarta o magro na mesma rodada", async () => {
    vi.mocked(collect as MockedFunction<typeof collect>).mockResolvedValue({
      items: [
        newsItem(
          "https://rico.com",
          "Estudo detalha avanço de LLM em análise de dados",
        ),
        newsItem(
          "https://magro.com",
          "Machine learning muda o mercado",
          "Resumo curto demais.",
        ),
      ],
      bySource: {},
      errors: [],
    });

    const result = await runPipeline(mockLlm());

    expect(result.selected).toBe(2);
    expect(result.skippedThinContent).toBe(1);
    expect(result.draftsCreated).toBe(1);
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it("dedup semântica é fail-safe: erro no embedder não derruba a rodada", async () => {
    vi.mocked(collect as MockedFunction<typeof collect>).mockResolvedValue({
      items: [
        newsItem(
          "https://a.com",
          "Databricks lança recurso de machine learning",
        ),
        newsItem(
          "https://b.com",
          "Snowflake anuncia novo data warehouse com IA",
        ),
      ],
      bySource: {},
      errors: [],
    });

    const embedder = {
      id: "boom",
      embed: vi.fn().mockRejectedValue(new Error("ollama caiu")),
    };

    const result = await runPipeline(mockLlm(), { embedder });

    expect(result.afterSemantic).toBe(2); // pulou a dedup, manteve os 2
    expect(result.draftsCreated).toBe(2);
  });
});
