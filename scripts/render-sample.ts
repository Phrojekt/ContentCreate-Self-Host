// Gera amostras do template em casos extremos para inspeção visual (robustez —
// backlog Bloco 3, item 4). Saída em ./tmp/render-samples/ (gitignored).
//
//   npm run render:sample
//
// Não acessa rede para imagem de fundo por padrão; passe uma URL real só se
// quiser testar o caminho com imagem.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { PostData, PostFormat } from "../src/types/post.js";

const OUT_DIR = join(process.cwd(), "tmp", "render-samples");

const HASHTAGS_SAMPLE = [
  "inteligenciaartificial",
  "machinelearning",
  "inovacao",
  "tecnologia",
  "dados",
];

const CASOS: { nome: string; format: PostFormat; data: PostData }[] = [
  // --- Capas com variantes de paleta ---
  {
    nome: "capa-default-com-teaser",
    format: "portrait",
    data: {
      shortTitle: "IA generativa supera humanos em raciocínio complexo",
      sourceCredit: "MIT Tech Review",
      date: "18 de junho de 2026",
      variant: "default",
      teaser:
        "Novo benchmark revela que modelos de linguagem avançados já superam especialistas humanos em tarefas de lógica e dedução.",
      hashtags: HASHTAGS_SAMPLE,
    },
  },
  {
    nome: "capa-breaking-lancamento",
    format: "portrait",
    data: {
      shortTitle: "OpenAI lança GPT-5 com raciocínio em tempo real",
      sourceCredit: "VentureBeat",
      date: "18 de junho de 2026",
      variant: "breaking",
      teaser:
        "O modelo chega com capacidade de pensar antes de responder, reduzindo erros em até 40% em tarefas de matemática.",
      hashtags: ["gpt5", "openai", "llm", "inteligenciaartificial"],
    },
  },
  {
    nome: "capa-data-analytics",
    format: "portrait",
    data: {
      shortTitle: "Relatório: 73% das empresas usam BI com IA em 2026",
      sourceCredit: "Gartner",
      date: "18 de junho de 2026",
      variant: "data",
      teaser:
        "O estudo ouviu 1.200 executivos e mostra crescimento de 38 pontos percentuais em relação ao ano anterior.",
      hashtags: ["bi", "analytics", "dados", "mercado", "inovacao"],
    },
  },
  {
    nome: "capa-business-mercado",
    format: "portrait",
    data: {
      shortTitle: "Startup brasileira de IA capta R$ 180 milhões em série B",
      sourceCredit: "Exame",
      date: "18 de junho de 2026",
      variant: "business",
      teaser:
        "A rodada foi liderada por fundo americano e avalia a empresa em R$ 1,2 bilhão, tornando-a o primeiro unicórnio de IA do Brasil.",
      hashtags: ["startup", "investimento", "ia", "brasil", "tecnologia"],
    },
  },

  // --- Slides de carrossel (corpo: marcador numérico + gancho + parágrafo) ---
  {
    nome: "corpo-slide-default",
    format: "portrait",
    data: {
      shortTitle: "IA generativa supera humanos em raciocínio complexo",
      lead: "O resultado nos testes",
      body: "O modelo GPT-5 acertou 94% das questões do exame de lógica avançada, enquanto especialistas humanos atingiram 87% na mesma prova.",
      sourceCredit: "MIT Tech Review",
      date: "18 de junho de 2026",
      variant: "default",
      position: { index: 2, total: 4 },
    },
  },
  {
    nome: "corpo-slide-ultimo-com-hashtags",
    format: "portrait",
    data: {
      shortTitle: "IA generativa supera humanos em raciocínio complexo",
      lead: "O que muda no ensino",
      body: "Pesquisadores recomendam revisão dos currículos universitários para preparar profissionais para colaboração com sistemas de IA.",
      sourceCredit: "MIT Tech Review",
      date: "18 de junho de 2026",
      variant: "default",
      position: { index: 4, total: 4 },
      hashtags: HASHTAGS_SAMPLE,
    },
  },
  {
    nome: "corpo-slide-breaking",
    format: "portrait",
    data: {
      shortTitle: "OpenAI lança GPT-5 com raciocínio em tempo real",
      lead: "Custo menor",
      body: "O preço de acesso cai 60% em relação ao GPT-4 Turbo, tornando o modelo mais acessível para startups e desenvolvedores independentes.",
      sourceCredit: "VentureBeat",
      date: "18 de junho de 2026",
      variant: "breaking",
      position: { index: 3, total: 5 },
    },
  },
  {
    nome: "corpo-slide-sem-lead",
    format: "portrait",
    data: {
      shortTitle: "IA generativa supera humanos em raciocínio complexo",
      body: "Slide de corpo sem gancho (fallback da divisão da legenda) deve renderizar só o parágrafo, sem quebrar o layout.",
      sourceCredit: "MIT Tech Review",
      date: "18 de junho de 2026",
      variant: "default",
      position: { index: 2, total: 3 },
    },
  },

  // --- Casos extremos de robustez ---
  {
    nome: "titulo-curto-sem-teaser",
    format: "square",
    data: {
      shortTitle: "IA bate recorde",
      sourceCredit: "TechCrunch",
      date: "18 de junho de 2026",
      variant: "default",
    },
  },
  {
    nome: "titulo-longo-retrato",
    format: "portrait",
    data: {
      shortTitle:
        "Especialistas apontam que a combinação de IA, dados e nuvem deve redefinir completamente o setor financeiro nos próximos cinco anos",
      sourceCredit: "Observatório Global",
      date: "18 de junho de 2026",
      variant: "data",
    },
  },
];

async function main() {
  const { SatoriRenderer } =
    await import("../src/services/rendering/satori-renderer.js");
  mkdirSync(OUT_DIR, { recursive: true });
  const renderer = new SatoriRenderer();

  for (const caso of CASOS) {
    const image = await renderer.render(caso.data, { format: caso.format });
    const file = join(OUT_DIR, `${caso.nome}.png`);
    writeFileSync(file, image.buffer);
    console.log(`✓ ${file} (${image.width}x${image.height})`);
  }

  console.log(`\n${CASOS.length} amostras geradas em ${OUT_DIR}`);
}

main().catch((err: unknown) => {
  console.error(
    "Falha ao gerar amostras:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
