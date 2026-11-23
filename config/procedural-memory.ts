// Edite SÓ este diretório (config/) + .env para um novo nicho.
// Não hardcode nada de nicho em src/.
//
// Memória PROCEDURAL curada manualmente (DEC-020): regras de estilo/qualidade
// que o dono julga valerem a pena reforçar no prompt do LLM, além das regras
// R0–R5 já embutidas em `src/services/llm/prompt.ts`. `AgenticRagProvider`
// recupera as entradas mais relevantes por similaridade e injeta como
// `NewsItem.learnedGuidance` antes de cada geração.
//
// `id` é estável (nunca reutilize um id para um conteúdo diferente — o sync
// faz upsert por id). `category` filtra o recall por variante do post
// ("default"|"breaking"|"data"|"business"); ausente = regra genérica, sempre
// candidata ao recall.
//
// Seed inicial: destilada das regras que já viviam hard-coded em prompt.ts
// (R0–R5, leads banidos, vocabulário proibido) — prova o mecanismo com
// conhecimento que já existia, sem inventar regras novas (DEC-020).

export interface ProceduralMemorySeed {
  id: string;
  content: string;
  category?: string;
}

export const proceduralMemory: ProceduralMemorySeed[] = [
  {
    id: "regra-tom-humano",
    content:
      "Escreva como alguém construindo um raciocínio, não como tópicos avulsos de ficha técnica. Conecte um slide ao anterior com transições naturais ('Por trás disso está...', 'O que isso muda na prática é...').",
  },
  {
    id: "regra-lead-especifico",
    content:
      "O lead de cada slide precisa conter uma palavra ou ideia que só existe NESTA notícia — um nome, um verbo de ação concreto, o objeto específico do fato. Um lead genérico o bastante para caber em qualquer notícia de IA está errado.",
  },
  {
    id: "regra-zero-invencao",
    content:
      "Todo número, percentagem, nome de empresa, citação ou comparação exibido deve aparecer literalmente no texto-fonte (ou nas fontes correlatas confirmando o mesmo fato). Sem dado no texto = sem dado no slide, nunca arredondar/inferir de um jeito que mude o sentido.",
  },
  {
    id: "regra-vocabulario-proibido",
    content:
      "Evite clichês vazios: 'especialistas alertam', 'tendência cresce', 'a IA avança', 'novas possibilidades', 'impacto significativo', 'representa um avanço'. Prefira sujeito concreto e verbo de ação.",
  },
  {
    id: "regra-cta-final",
    content:
      "O último slide sempre fecha com uma pergunta que force posição real do leitor (nunca 'o que você acha?' genérico) seguida do convite para seguir a conta — nunca introduz um fato novo, só amarra o que já foi dito.",
  },
  {
    id: "regra-estatistica-analytics",
    content:
      "Para notícias de analytics/BI/pesquisa, priorize o arquétipo Estatística quando houver um número que carregue a história — esse público responde melhor a dado concreto do que a texto corrido.",
    category: "data",
  },
  {
    id: "regra-comparacao-negocios",
    content:
      "Para notícias de mercado/negócios (investimento, aquisição, crescimento), o arquétipo Comparação (antes/depois, X vs Y) costuma comunicar o impacto financeiro melhor que um parágrafo narrativo.",
    category: "business",
  },
  // A partir daqui: seed destilada da biblioteca `docs/brain/` (DEC-024) via
  // `docs/prompts/P5-content-brain-memory-seed.md` — mesmo mecanismo acima,
  // reforçando estratégia de atenção/circulação (content-brain.md), não só
  // correção. IDs novos, nunca reutilizados.
  {
    id: "regra-gancho-formulas",
    content:
      "A capa (shortTitle) precisa usar uma das 6 fórmulas de gancho — número que ancora, curiosity gap sem clickbait vazio, contraste antes/depois, o que está em jogo, contraintuitivo, ou pergunta específica — nunca uma manchete-rótulo genérica que caiba em qualquer notícia de IA.",
  },
  {
    id: "regra-e-dai",
    content:
      "Todo slide de contexto responde 'por que isso importa para quem decide' (o gestor/PM/empreendedor). Um slide sem 'e daí' concreto não entra no carrossel — fato empilhado sem consequência prática é o principal anti-padrão da conta.",
  },
  {
    id: "regra-leitura-dupla",
    content:
      "O texto precisa ser entendido pelo leitor-decisor E validado como correto por um leitor técnico — nunca simplificar ao ponto de ficar errado. Se um dos dois travar, o post não está pronto.",
  },
  {
    id: "regra-hype-sinal",
    content:
      "Não amplifique alegação de fabricante como se fosse fato estabelecido. Número redondo sem metodologia, benchmark citado pela própria empresa que lançou o produto, ou 'primeiro do mundo'/'supera humanos' são sinais de hype — trate com ceticismo ou vire o ângulo em checar o hype.",
  },
  {
    id: "regra-cta-por-objetivo",
    content:
      "O fechamento traz UM CTA primário conforme o objetivo do post — salvar (autoridade/referência), enviar (crescimento/mostrar a alguém) ou comentar (pergunta que força posição) — mais o 'siga' como fecho secundário. Nunca empilhar quatro pedidos ao mesmo tempo.",
  },
  {
    id: "regra-lexico-sobrio",
    content:
      "Banir superlativo de hype: 'revolucionário', 'insano', 'bombástico', 'game-changer', 'disruptivo', emoji de foguete/fogo. Preferir verbos de precisão: cortar, dobrar, travar, destravar, encolher, acelerar, pressionar, redesenhar.",
  },
  {
    id: "regra-numero-ptbr",
    content:
      "Todo número em formato PT-BR — decimal com vírgula, milhar com ponto, 'US$'/'R$' antes do valor, '%' colado, multiplicador com '×' — e sempre contextualizado: o valor nunca aparece sozinho, sempre com a régua ao lado (o que ele mede, comparação com o estado anterior).",
  },
  {
    id: "regra-lancamento-aida",
    content:
      "Para lançamento/anúncio de produto ou modelo (pilar P1), o framework AIDA (Atenção → Interesse → Desejo → Ação) costuma reter melhor: a capa prende com o fato mais forte, os slides do meio desenvolvem o que é e por que importa, e o fechamento converte com o CTA.",
    category: "breaking",
  },
  {
    id: "regra-desmistificacao-default",
    content:
      "Para conceito técnico em alta ou crença comum equivocada (pilar P4), o arquétipo Contexto que desfaz um mito específico gera mais saves e shares que um resumo genérico — nomeie a crença errada e corrija com o fato, sem soar condescendente.",
    category: "default",
  },
];
