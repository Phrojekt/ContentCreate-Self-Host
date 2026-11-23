// Nicho: Inteligência Artificial & Business Intelligence
// Edite SÓ este diretório (config/) + .env para um novo nicho.
// Não hardcode nada de nicho em src/.
//
// Fontes de notícia por nicho: feeds RSS + queries de API.
// Os TIPOS são contratos de domínio (vivem em src/types); aqui ficam só os DADOS.
// Prioridade de coleta: RSS -> API de notícias -> scraping (último recurso) (DEC-004).

import type { NewsApiQueryConfig, RssFeedConfig } from "@/types";

export const rssFeeds: RssFeedConfig[] = [
  // --- Fontes internacionais (inglês) ---
  {
    id: "mit-tech-review",
    url: "https://www.technologyreview.com/feed/",
    sourceName: "MIT Technology Review",
  },
  {
    id: "venturebeat-ai",
    url: "https://venturebeat.com/category/ai/feed/",
    sourceName: "VentureBeat AI",
  },
  {
    id: "the-verge-ai",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    sourceName: "The Verge — AI",
  },
  {
    id: "towards-data-science",
    url: "https://towardsdatascience.com/feed",
    sourceName: "Towards Data Science",
  },
  {
    id: "analytics-vidhya",
    url: "https://www.analyticsvidhya.com/feed/",
    sourceName: "Analytics Vidhya",
  },

  // --- Fontes em português (URLs diretas — extrator de artigo funciona) ---
  // Evitar feeds de agregadores (Google News, Yahoo News) cujas URLs são
  // redirecionamentos rastreados que o extrator não consegue seguir, resultando
  // em conteúdo insuficiente para o LLM e alucinação de fatos.
  {
    id: "canaltech-ia",
    url: "https://canaltech.com.br/rss/",
    sourceName: "Canaltech",
  },
  {
    id: "olhar-digital",
    url: "https://olhardigital.com.br/feed/",
    sourceName: "Olhar Digital",
  },
  {
    id: "tecnoblog",
    url: "https://tecnoblog.net/feed/",
    sourceName: "Tecnoblog",
  },
  {
    id: "tecmundo",
    url: "https://rss.tecmundo.com.br/feed",
    sourceName: "TecMundo",
  },
  {
    id: "exame-tecnologia",
    url: "https://exame.com/tecnologia/feed/",
    sourceName: "Exame Tecnologia",
  },
];

export const newsApiQueries: NewsApiQueryConfig[] = [
  // Descomentar e preencher NEWS_API_KEY no .env para ativar.
  // {
  //   id: "newsapi-ai-en",
  //   query: "artificial intelligence OR machine learning OR LLM",
  //   language: "en",
  //   provider: "newsapi",
  // },
  // {
  //   id: "newsapi-ia-pt",
  //   query: "inteligência artificial OR aprendizado de máquina OR LLM",
  //   language: "pt",
  //   provider: "newsapi",
  // },
  // {
  //   id: "newsapi-bi-pt",
  //   query: "business intelligence OR análise de dados OR data warehouse",
  //   language: "pt",
  //   provider: "newsapi",
  // },
];
