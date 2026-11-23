// Edite SÓ este diretório (config/) + .env para um novo nicho.
// Não hardcode nada de nicho em src/.
//
// Memória EPISÓDICA semeada manualmente (DEC-020/DEC-024): os exemplos-ouro
// completos e anotados de `docs/brain/exemplos.md`, como dados estruturados —
// o material few-shot que mais ancora um LLM (sobretudo modelos menores),
// disponível desde a primeira rodada, antes de existir qualquer rascunho
// aprovado por um humano. `AgenticRagProvider` recupera por similaridade
// (categoria + proximidade de embedding) a partir da 2ª tentativa e injeta
// como `NewsItem.learnedGuidance` (mesmo canal da memória procedural).
//
// Importante: um exemplo aqui é referência de PADRÃO (gancho, framework,
// variedade de arquétipo, "e daí") — nunca fonte de fato. A notícia-fonte de
// cada exemplo é FICTÍCIA (ver `exemplos.md`); o pipeline nunca copia os
// fatos destes exemplos para um post real (R1 continua valendo).
//
// `id` é estável (nunca reutilize um id para um conteúdo diferente — o sync
// faz upsert por id). `category` casa com a variante do post ("breaking"|
// "data"|"business"|"default") para o recall; ausente = candidato a
// qualquer categoria.

export interface EpisodicSeed {
  id: string;
  /** Categoria/variante do post ("breaking"|"data"|"business"|"default"); ausente = genérico. */
  category?: string;
  /** 1 linha: que tipo de notícia este exemplo ilustra (casa o recall com a situação real). */
  situation: string;
  /** O carrossel-ouro completo (capa + slides + legenda), como referência few-shot. */
  example: string;
}

export const episodicSeed: EpisodicSeed[] = [
  {
    id: "exemplo-ouro-lancamento-aida",
    category: "breaking",
    situation:
      "Lançamento de produto/modelo de IA com preço ou desempenho que muda o cálculo de adoção do decisor (pilar P1, framework AIDA).",
    example: `NOTÍCIA-FONTE (fictícia, só ilustra o padrão — nunca copiar os fatos): a OpenAI lançou o "GPT-4o mini pro" a US$ 0,15 por milhão de tokens de entrada, 60% abaixo do GPT-4o, mantendo 95% da qualidade em classificação/extração e rodando 3× mais rápido. A executiva de produto Mira Chen disse: "A maior parte das cargas de trabalho em produção não precisa do modelo mais caro; precisa do modelo certo pelo preço certo."

shortTitle (gancho "o que está em jogo"): "A OpenAI cortou 60% do preço da IA em produção — e mudou a conta de quem terceiriza"

Slide 1 [cover] eyebrow "[ LANÇAMENTO ]" — teaser: "O modelo mais barato nem sempre é o pior. Às vezes é o certo."

Slide 2 [context] eyebrow "O QUE ACONTECEU" lead "O modelo do meio" — body: "A OpenAI lançou o GPT-4o mini pro a US$ 0,15 por milhão de tokens de entrada — 60% mais barato que o GPT-4o. A aposta não é competir em potência máxima, mas ocupar a faixa que a maioria das empresas realmente usa: tarefas de classificar e extrair, onde o modelo topo de linha é força excessiva."

Slide 3 [stat] eyebrow "O NÚMERO" lead "Quase o mesmo, por menos" — stat: { value: "95%", label: "da qualidade do GPT-4o em classificação e extração", supporting: "com 3× mais velocidade, segundo a OpenAI" } — body: "O corte de preço só importa se a qualidade acompanha. A OpenAI afirma manter 95% do desempenho do modelo caro nessas tarefas — e rodar três vezes mais rápido. Para quem processa volume, velocidade e preço compõem a mesma economia."

Slide 4 [quote] eyebrow "O QUE DISSERAM" lead "O modelo certo" — quote: { text: "A maior parte das cargas em produção não precisa do modelo mais caro; precisa do modelo certo pelo preço certo.", author: "Mira Chen", role: "Executiva de produto, OpenAI" } — body: "A fala resume a virada: a régua deixou de ser 'qual o modelo mais poderoso' e passou a ser 'qual o modelo suficiente'. Para o time que decide arquitetura, isso reabre a conta de quando vale pagar pelo topo."

Slide 5 [closing] eyebrow "RESUMO" — síntese: "Um modelo 60% mais barato que entrega 95% da qualidade muda o cálculo de terceirizar versus rodar em casa — e pressiona o preço do mercado inteiro." — pergunta: "Você revisaria hoje qual modelo roda em produção no seu time, ou esperaria o benchmark independente?" — CTA: "Salve para revisar quando for decidir. E siga @ia.e.dados para não perder o que importa em IA & Dados."

caption: "A OpenAI colocou um modelo 60% mais barato na mesa — US$ 0,15 por milhão de tokens — e diz manter 95% da qualidade do GPT-4o em classificar e extrair. Para quem roda volume em produção, a pergunta deixou de ser 'qual o modelo mais forte' e virou 'qual o modelo suficiente'. Velocidade 3× maior entra na mesma economia: processa mais, custa menos. A executiva Mira Chen resumiu — a maioria das cargas precisa do modelo certo, não do mais caro. Vale revisar sua stack antes que o concorrente revise a dele. Você trocaria agora ou esperaria um benchmark independente? Fonte: TechCrunch"

hashtags: InteligenciaArtificial, IA, OpenAI, LLM, MachineLearning, IAgenerativa, TecnologiaCorporativa

Por que é ouro: gancho "o que está em jogo" com número real (60%); AIDA completo (capa prende → contexto+número desenvolvem interesse/desejo → fechamento age); arquétipos variados (context → stat → quote → closing, nenhum repetido); todo número (60%, 95%, 3×, US$ 0,15) vem da fonte (R1); CTA primário = salvar + siga secundário.`,
  },
  {
    id: "exemplo-ouro-pesquisa-bab",
    category: "data",
    situation:
      "Pesquisa/estudo com estatística marcante que carrega a história, incluindo uma ressalva honesta que evita soar como hype (pilar P3, framework BAB).",
    example: `NOTÍCIA-FONTE (fictícia, só ilustra o padrão — nunca copiar os fatos): um estudo do MIT Sloan acompanhou 120 empresas de médio porte que adotaram agentes de IA no fechamento contábil mensal; o tempo médio caiu de 9 para 4 dias, pela automação da conciliação de lançamentos. Em 30% das empresas, porém, o tempo AUMENTOU nos dois primeiros meses, por falta de dados estruturados. O pesquisador João Ferraz disse: "O gargalo raramente é o modelo. É a qualidade do dado que a empresa já tem."

shortTitle (gancho "contraste antes/depois" com ressalva honesta): "O fechamento contábil que levava 9 dias agora leva 4 — mas não para todo mundo"

Slide 1 [cover] eyebrow "[ ANALYTICS ]" — teaser: "O que separou quem ganhou tempo de quem perdeu não foi a IA."

Slide 2 [context] eyebrow "O QUE MUDOU" lead "Nove viram quatro" — body: "Um estudo do MIT Sloan acompanhou 120 empresas de médio porte que colocaram agentes de IA no fechamento contábil mensal. O tempo médio caiu de 9 para 4 dias. O ganho não veio de trocar contadores por robôs, mas de automatizar a conciliação de lançamentos — a etapa que mais comia horas."

Slide 3 [comparison] eyebrow "ANTES / DEPOIS" lead "A conta do tempo" — comparison: { leftLabel: "Antes", leftValue: "9 dias", leftDetail: "conciliação manual, lançamento a lançamento", rightLabel: "Depois", rightValue: "4 dias", rightDetail: "conciliação automatizada por agentes" } — body: "A diferença de cinco dias é o mês fechando na primeira semana em vez de na segunda. Para o financeiro, é decisão com dado fresco em vez de retrato do passado."

Slide 4 [context] eyebrow "A LETRA MIÚDA" lead "Nem todo mundo ganhou" — body: "Em 30% das empresas, o tempo aumentou nos dois primeiros meses. O motivo não foi o modelo, e sim a falta de dados estruturados: o agente só acelera a conciliação quando os lançamentos chegam limpos e padronizados. Onde o dado era bagunçado, a IA só expôs a bagunça mais rápido."

Slide 5 [quote] eyebrow "O QUE DISSERAM" lead "O gargalo real" — quote: { text: "O gargalo raramente é o modelo. É a qualidade do dado que a empresa já tem.", author: "João Ferraz", role: "Pesquisador, MIT Sloan" } — body: "A frase vale como aviso a quem vai adotar: o retorno da IA depende menos da ferramenta e mais da casa arrumada. Investir no dado antes costuma render mais que investir no modelo."

Slide 6 [closing] eyebrow "RESUMO" — síntese: "Agentes cortaram o fechamento de 9 para 4 dias onde o dado estava organizado — e atrasaram onde não estava. A IA acelerou a régua que a empresa já tinha, para o bem e para o mal." — pergunta: "O dado do seu financeiro está pronto para ser acelerado, ou a IA só mostraria a bagunça mais rápido?" — CTA: "Manda para quem cuida de dados ou de finanças no seu time. E siga @ia.e.dados."

caption: "Agentes de IA cortaram o fechamento contábil de 9 para 4 dias num estudo do MIT Sloan com 120 empresas. Mas o número bonito esconde uma condição: em 30% delas o tempo aumentou nos dois primeiros meses, por falta de dado estruturado. A IA não substituiu contadores — automatizou a conciliação, a etapa que mais consumia horas. Onde o dado estava limpo, o mês passou a fechar na primeira semana. Onde estava bagunçado, a ferramenta só expôs a bagunça mais rápido. Como resumiu o pesquisador João Ferraz, o gargalo raramente é o modelo; é o dado que a empresa já tem. Antes de comprar o agente, vale perguntar se a casa está arrumada. O seu financeiro está pronto para ser acelerado? Fonte: MIT Sloan Review"

hashtags: InteligenciaArtificial, Dados, AgentesDeIA, BusinessIntelligence, Contabilidade, DataQuality, IAnoNegocio

Por que é ouro: gancho de contraste antes/depois + ressalva honesta que cria curiosity gap sem clickbait; BAB completo (antes 9 dias → depois 4 dias → ponte: dado estruturado faz a diferença); arquétipo comparison usado exatamente quando a história é um antes/depois; honestidade acima de hype (o slide 4 dá a má notícia — os 30% que pioraram — em vez de esconder).`,
  },
];
