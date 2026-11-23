// Nicho: Inteligência Artificial & Business Intelligence
// Edite SÓ este diretório (config/) + .env para um novo nicho.
// Não hardcode nada de nicho em src/.
//
// Palavras-chave do filtro de relevância por nicho (Bloco 2).
//   - required: ao menos uma deve aparecer (título ou resumo) para a notícia ser relevante.
//   - blocked:  qualquer ocorrência descarta a notícia.
// Case-insensitive. Filtro aplicado sobre: title + summary concatenados.

export type KeywordsConfig = {
  required: string[];
  blocked: string[];
};

export const keywords: KeywordsConfig = {
  required: [
    // Inteligência Artificial (PT)
    "inteligência artificial",
    "aprendizado de máquina",
    "machine learning",
    "aprendizado profundo",
    "deep learning",
    "rede neural",
    "neural network",
    "processamento de linguagem natural",
    "nlp",
    "visão computacional",
    "computer vision",
    "modelo de linguagem",
    "large language model",
    "llm",
    "gpt",
    "gemini",
    "claude",
    "llama",
    "mistral",
    "generative ai",
    "ia generativa",
    "chatgpt",
    "copilot",
    "prompt",
    "fine-tuning",
    "rag",
    "retrieval augmented",
    "agente de ia",
    "ai agent",
    "automação inteligente",
    "intelligent automation",

    // Business Intelligence & Dados (PT/EN)
    "business intelligence",
    "inteligência de negócios",
    "análise de dados",
    "data analytics",
    "data warehouse",
    "data lake",
    "data mesh",
    "data science",
    "ciência de dados",
    "big data",
    "dashboard",
    "tableau",
    "power bi",
    "looker",
    "metabase",
    "dbt",
    "apache spark",
    "databricks",
    "snowflake",
    "data engineering",
    "engenharia de dados",
    "pipeline de dados",
    "etl",
    "elt",
    "mlops",
    "dataops",
  ],

  blocked: [
    // Entretenimento / esporte — fora do escopo
    "futebol",
    "esporte",
    "novela",
    "celebridade",
    "fofoca",
    "reality show",
    "bbb",
    "oscar",
    "grammy",
    // Cinema / TV / quadrinhos (o "Supergirl" vazava por aqui)
    "filme",
    "cinema",
    "série",
    "trailer",
    "estreia",
    "elenco",
    "ator",
    "atriz",
    "superman",
    "supergirl",
    "marvel",
    "dcu",
    "anime",
    "temporada",
    // Política e notícias gerais — a menos que cite IA/BI diretamente (mas o required garante isso)
    "eleição",
    "presidente",
    "ministro",
    "congresso",
    "impeachment",
    // Outros ruídos
    "horóscopo",
    "sorteio",
    "promoção",
    "desconto",
  ],
};
