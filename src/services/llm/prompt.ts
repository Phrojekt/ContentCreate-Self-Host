import { projectConfig } from "@config/project.config";
import type { BrandProfile } from "@/lib/settings-schema";
import { parseSlideContentArray } from "@/lib/slide-content";
import type { NewsItem } from "@/types";
import { computeContentTarget } from "./content-target";
import type { LlmOutput } from "./llm-provider";
import { sanitizeLlmOutput } from "./sanitize";

/** Teto de caracteres do artigo enviados ao LLM (cabe com folga no num_ctx de 8192). */
const MAX_SOURCE_CHARS = 9000;

/**
 * Gera o arco narrativo com slots nomeados de forma que NÃO sejam copiáveis
 * como lead. Cada slot instrui o lead com "NÃO COPIE este título".
 * O slot final tem CTA como componente numerado obrigatório.
 */
/**
 * IMPORTANTE (lição aprendida): listar "Bons exemplos" de leads genéricos-mas-
 * plausíveis ("Na prática", "E agora?", "O que foi feito"...) faz o modelo
 * COPIAR essas frases literalmente em quase todo carrossel — viram a resposta
 * pronta, não uma ilustração de estilo. Por isso cada slot abaixo usa um
 * exemplo COMPLETO (lead + trecho) de um domínio fictício, nunca aplicável à
 * notícia real, para ensinar o PADRÃO de especificidade sem dar frase pronta.
 */
function buildNarrativeArc(
  slideCount: number,
  handle: string,
  niche: string,
): string {
  /**
   * Framework de copy (content-brain sec 8): escolhido pelo tipo de história que
   * o texto-fonte sustenta. Aplica-se ao carrossel inteiro — não misture os três.
   */
  const frameworkGuidance = `
Antes de escrever os slides, escolha UM framework narrativo pelo tipo de história que o
texto-fonte sustenta — e mantenha esse framework do início ao fim (não misture os três):
  • PAS (Problema → Agitação → Solução) — quando a notícia toca uma dor do leitor (custo,
    risco, ineficiência). A capa nomeia o problema; os slides seguintes agravam o porquê;
    um slide vira a chave com a novidade; o fechamento resolve.
  • BAB (Antes → Depois → Ponte) — quando é transformação, algo que ficou possível. Casa com
    o arquétipo COMPARAÇÃO. A capa mostra o "antes"; um slide mostra o "depois"; outro explica
    a ponte (como).
  • AIDA (Atenção → Interesse → Desejo → Ação) — para lançamento/novidade que interessa por
    si. A capa prende; os slides desenvolvem o que é e por que importa; o fechamento age (CTA).
`;

  /**
   * Slot de fechamento — sempre o último slide.
   * Arquétipo: closing (brand-guide sec 6.6).
   */
  const closingSlot = `
[SLIDE ${slideCount}] — Arquétipo FECHAMENTO
  slideType: "closing"
  eyebrow: "RESUMO"
  lead (2–4 palavras nomeando a síntese específica desta notícia — nunca "O resumo" ou "Conclusão"):
    Exemplo de ESTILO (domínio fictício — NUNCA copie): se a notícia fosse sobre um hospital que
    digitalizou prontuários, um bom lead seria "O prontuário virou dado" (nomeie a virada),
    não "Resumindo" ou "Para concluir" (etiquetas genéricas).
  body (três itens obrigatórios em sequência):
    (1) Uma frase de síntese que AMARRA o que já apareceu nos slides anteriores — nunca introduz
        fato novo. Se soa a informação nova, ela pertence a um slide de Contexto antes deste.
    (2) Pergunta que force posição concreta — escolha uma abordagem:
        "Você adotaria isso no seu time agora ou esperaria mais evidências?"
        "Isso muda a arquitetura que vocês usam hoje?"
        "Qual risco você ainda não mapeou aqui?"
        NUNCA: "o que você acha?", "conta nos comentários" — genérico demais.
    (3) UM CTA primário, escolhido pelo objetivo deste post (nunca empilhe os três juntos):
        — SALVAR (autoridade — post de referência, número ou glossário): "Salve para consultar
          quando for decidir sobre isso."
        — ENVIAR (crescimento — post que a pessoa quer mostrar a um colega específico): "Manda
          para quem no seu time vai precisar disso."
        — COMENTAR (autoridade + alcance — quando a pergunta do item (2) já força uma posição
          real): a própria pergunta cumpre esse papel; não precisa de frase de CTA adicional.
        Escolha UM CTA primário e, depois dele, escreva exatamente esta linha de fecho
        secundário: "Siga ${handle} para não perder o que vale a sua atenção em ${niche}."
  stat: omitir (não é slide de estatística)
  comparison: omitir
  quote: omitir`;

  if (slideCount <= 2) {
    return `${frameworkGuidance}
[SLIDE 1] — Arquétipo CONTEXTO
  slideType: "context"
  eyebrow: escolha o mais preciso para este slide: "O QUE ACONTECEU" | "POR QUE IMPORTA" | "COMO FUNCIONA"
    NUNCA use eyebrow genérico como "Detalhes", "Mais informações" ou igual ao de outro slide.
  lead (2–4 palavras sobre O ACONTECIMENTO ESPECÍFICO desta notícia):
    Exemplo de ESTILO (domínio fictício — NUNCA copie): para uma notícia sobre uma padaria que
    passou a usar sensor de estoque, um bom lead seria "O pão que sobrava", não "O anúncio" ou
    "O que foi lançado" — esses cabem em qualquer notícia e por isso não dizem nada.
  body: Diga quem fez o quê, com que resultado. Concreto, sem enrolação.
${closingSlot}`;
  }

  /**
   * Slots intermediários — variação de arquétipo por conteúdo disponível.
   * Regra do brand guide (sec 6): nunca repetir o mesmo arquétipo mais de 2x seguidas.
   */
  const deepCount = slideCount - 4;

  const deepSlots =
    deepCount <= 0
      ? ""
      : deepCount === 1
        ? `

[SLIDE 4] — Arquétipo ESTATÍSTICA ou CONTEXTO (escolha conforme o texto)
  Se o texto-fonte contém UM número que carrega a história (crescimento, investimento, taxa):
    slideType: "stat"
    eyebrow: "O NÚMERO"
    lead: 2–4 palavras nomeando A DIMENSÃO do número (ex.: "Custo por mil tokens" — não "Os números")
    body: contextualize o número: o que ele mede, como foi obtido, o que significa na prática.
    stat.value: o número literal do texto (ex.: "40%", "US$ 2,3 bi") — NUNCA inventado (R1).
    stat.label: uma linha explicando o que o número mede.
    stat.supporting: metodologia ou amostra, se disponível no texto.
  Se NÃO há número concreto no texto:
    slideType: "context"
    eyebrow: ângulo específico deste slide (ex.: "QUEM É AFETADO", "A LINHA DO TEMPO")
    lead/body: ângulo novo — escala, abrangência, implicação secundária.`
        : `

[SLIDES 4 a ${slideCount - 1}] — Arquétipos variados (ESTATÍSTICA | COMPARAÇÃO | CITAÇÃO | CONTEXTO)
  Um arquétipo novo por slot — nunca repetir o mesmo arquétipo mais de 2 vezes seguidas.
  Escolha o arquétipo mais adequado ao conteúdo disponível no texto:

  ESTATÍSTICA — quando há UM número que carrega a história:
    slideType: "stat" · eyebrow: "O NÚMERO"
    stat.value: literal do texto (R1 — nunca inventado) · stat.label: uma linha · stat.supporting: opcional
    lead + body: contextualize o número.

  COMPARAÇÃO — quando a notícia é fundamentalmente um antes/depois ou X vs Y:
    slideType: "comparison" · eyebrow: "ANTES / DEPOIS" ou "X VS. Y" (use os termos reais)
    comparison.leftLabel / leftValue / leftDetail (antes ou opção A)
    comparison.rightLabel / rightValue / rightDetail (depois ou opção B)
    lead + body: explique a comparação e o que ela significa.
    Regra: colunas simétricas em extensão de texto.

  CITAÇÃO — quando há frase atribuível (executivo, pesquisador) que resume o ângulo:
    slideType: "quote" · eyebrow: "O QUE DISSERAM"
    quote.text: frase real da matéria (R2 — reescreva se for cópia direta longa, mas preserve o sentido)
    quote.author: nome real mencionado na matéria (R1 — nunca inventado)
    quote.role: cargo/organização (R1)
    lead + body: contextualize quem disse e por quê importa.

  CONTEXTO — quando nenhum dos acima se aplica:
    slideType: "context" · eyebrow: ângulo específico ("QUEM É AFETADO", "A LINHA DO TEMPO", etc.)
    Nunca use eyebrow genérico. Nunca repita o eyebrow de outro slide do mesmo carrossel.
    lead + body: ângulo novo, nunca reformulação do que já foi dito.`;

  return `${frameworkGuidance}
[SLIDE 1] — Arquétipo CONTEXTO — apresente o fato central
  slideType: "context"
  eyebrow: "O QUE ACONTECEU"
  lead (2–4 palavras sobre O ACONTECIMENTO ESPECÍFICO):
    Exemplo de ESTILO (domínio fictício — NUNCA copie): para uma notícia sobre uma padaria que
    passou a usar sensor de estoque, um bom lead seria "O pão que sobrava", não "O anúncio" ou
    "O que foi feito" — esses cabem em qualquer notícia e por isso não dizem nada.
  body: Diga quem fez o quê, com que resultado. Concreto, sem enrolação.

[SLIDE 2] — Arquétipo CONTEXTO — explique por que aconteceu
  slideType: "context"
  eyebrow: "POR QUE IMPORTA" ou "O QUE LEVOU A ISSO" (escolha o mais preciso)
  lead (2–4 palavras sobre A CAUSA ESPECÍFICA):
    Exemplo de ESTILO (domínio fictício — NUNCA copie): "O pão jogado fora" nomeia a causa real;
    "O problema real" ou "Por trás disso" são etiquetas genéricas.
  body: Contexto, motivação, causa ou problema. Conecte ao Slide 1 com transição natural.

[SLIDE 3] — Arquétipo CONTEXTO — mostre o impacto prático
  slideType: "context"
  eyebrow: "NA PRÁTICA" ou "COMO FUNCIONA" ou "QUEM É AFETADO" (escolha o mais preciso)
  lead (2–4 palavras sobre O IMPACTO ESPECÍFICO):
    Exemplo de ESTILO (domínio fictício — NUNCA copie): "Menos pão fora do prazo" nomeia o
    impacto real; "Na prática" ou "O que muda" são etiquetas que cabem em qualquer assunto.
  body: O que muda para quem trabalha com ${niche}? Rotina, arquitetura, custo, ferramentas.${deepSlots}
${closingSlot}`;
}

/**
 * Prompt de reescrita (DEC-008): texto próprio, sem cópia, creditando a fonte.
 * Compartilhado entre os providers (Anthropic, Ollama) — uma só fonte de verdade.
 *
 * Estruturado para robustez em modelos menores (qwen2.5:7b):
 * - Regras críticas R1–R5 ANTES do arco (modelos menores priorizam contexto inicial).
 * - Leads: "NÃO COPIE o nome do slot" inline em cada slot do arco.
 * - Body: mínimo de palavras como regra numerada + exemplo RUIM/BOM lado a lado.
 * - CTA: componente numerado dentro do último slot (impossível ignorar).
 * - Checklist de auto-verificação imediatamente antes do JSON.
 */
/**
 * Seção "FONTES CORRELATAS" (DEC-019): outras fontes que relataram a MESMA
 * notícia nesta rodada (`clusterByEmbedding`, Bloco 2). Instrui o LLM a usá-las
 * só para CONFIRMAR — nunca para introduzir um fato ausente da fonte principal
 * (preserva R1, zero invenção). Vazio → não aparece no prompt (custo zero
 * quando não há corroboração nesta rodada).
 */
function buildCorroboratingSourcesSection(item: NewsItem): string {
  const sources = item.corroboratingSources ?? [];
  if (sources.length === 0) return "";

  const lines = sources
    .map((s) => `— [${s.source}] ${s.title}: ${s.text}`)
    .join("\n");

  return `\n════ FONTES CORRELATAS (mesma notícia, outras fontes) ════
Use estas fontes SÓ para CONFIRMAR fatos que também aparecem no texto principal
(cross-checagem entre fontes) — NUNCA para introduzir um fato que exista SÓ
aqui e não na notícia principal (R1 continua valendo). Estas fontes podem
estar em inglês — isso é só material de referência para você CONFIRMAR fatos;
nunca copie a frase daqui para o slide/legenda, nem em inglês nem traduzida ao
pé da letra (R0 e R2 continuam valendo aqui igual valem para a notícia principal).
${lines}
`;
}

/**
 * Seção "LIÇÕES E REGRAS APRENDIDAS" (DEC-020): memória procedural/episódica
 * recuperada por `AgenticRagProvider` + feedback corretivo de uma tentativa
 * anterior reprovada. Posicionada logo após R0–R5 (modelos menores priorizam
 * contexto inicial — mesmo racional das regras R1–R5). Vazio → não aparece.
 */
function buildLearnedGuidanceSection(item: NewsItem): string {
  const guidance = item.learnedGuidance ?? [];
  if (guidance.length === 0) return "";

  const lines = guidance.map((g) => `— ${g}`).join("\n");
  return `\n════ LIÇÕES E REGRAS APRENDIDAS (aplique junto com R0–R5) ════
${lines}
`;
}

/** Perfil padrão (config/) — mantém o prompt idêntico ao de antes da DEC-027. */
export function defaultBrandProfile(): BrandProfile {
  return {
    brandName: projectConfig.theme.design.brand,
    handle: projectConfig.social.instagramHandle,
    networkLabel: "Instagram",
    niche: projectConfig.theme.name,
  };
}

export function buildPrompt(
  item: NewsItem,
  profile: BrandProfile = defaultBrandProfile(),
): string {
  const fullText = item.content ?? item.summary;
  const target = computeContentTarget(fullText.length);
  const sourceText = fullText.slice(0, MAX_SOURCE_CHARS);
  const { handle, niche, networkLabel } = profile;

  const contentWarning =
    target.tier === "limited"
      ? `\n⚠️ CONTEÚDO LIMITADO: texto curto. NÃO invente dados que não estejam literalmente aqui. Prefira cautela a quantidade.\n`
      : "";
  const learnedGuidanceSection = buildLearnedGuidanceSection(item);
  const corroboratingSourcesSection = buildCorroboratingSourcesSection(item);

  const slidesPlaceholder = Array.from(
    { length: target.slideCount },
    (_, i) => {
      const isLast = i === target.slideCount - 1;
      if (isLast) {
        return '{"slideType": "closing", "eyebrow": "RESUMO", "lead": "...", "body": "..."}';
      }
      return '{"slideType": "context", "eyebrow": "...", "lead": "...", "body": "..."}';
    },
  ).join(",\n    ");

  return `Você é um comunicador de tecnologia excepcionalmente claro — parte jornalista investigativo, parte professor que adora o assunto, parte especialista que domina ${niche}. Você escreve de um jeito que um gestor de RH, um médico curioso ou um estudante de administração acompanha sem dificuldade — e ao mesmo tempo um engenheiro sênior lê o mesmo texto e pensa "está correto". Você não escolhe entre profundidade e clareza: entrega as duas.

Seu leitor prioritário é quem PRECISA DECIDIR — um gestor, PM ou empreendedor que vai usar este post para decidir adotar, esperar, investir ou ignorar. Escreva sempre pensando em "o que isso muda na decisão dele", não para quem já domina o assunto. Todo post precisa passar no teste da leitura dupla: o decisor entende a implicação sem esforço E um técnico que lê o mesmo texto não encontra erro nem simplificação que distorce.

Sua voz é sóbria: informa, não vende. Zero superlativo vazio — nunca "revolucionário", "insano", "bombástico" ou qualquer variação de hype. A autoridade vem da clareza e da precisão, nunca do entusiasmo.

Quando menciona algo técnico, você ancora em uma referência concreta — não para simplificar demais, mas porque qualquer pessoa inteligente entende melhor com um exemplo tangível. Você pode emitir julgamentos de relevância desde que baseados no texto. Você NUNCA condescende, NUNCA exagera com adjetivos vazios, NUNCA inventa dados.

════════════════════════════════════════
TAREFA: transforme a notícia em um carrossel ${networkLabel} com EXATAMENTE ${target.slideCount} slides de corpo (+ a capa no campo shortTitle).${contentWarning}
════════════════════════════════════════

REGRAS NÃO-NEGOCIÁVEIS — valem para todos os campos:

R0. IDIOMA PT-BR — Todo o conteúdo gerado (shortTitle, eyebrow, lead, body, caption, hashtags,
    e também "quote.text"/"quote.role") deve estar em Português Brasileiro, SEM EXCEÇÃO. Se a
    notícia-fonte (ou uma fonte correlata) estiver em inglês, TRADUZA — nunca copie o trecho em
    inglês, nem parcialmente, nem "só a citação". Uma citação atribuída também é traduzida (prática
    editorial padrão: "— tradução livre" não precisa aparecer, só traduza). Nunca misture idiomas
    numa mesma frase; nunca deixe termos técnicos em inglês sem tradução ou contextualização
    (ex.: "fine-tuning" → "ajuste fino (fine-tuning)"). Exceção: nomes próprios, marcas e siglas
    consagradas (GPT, API, LLM, BI, AWS) permanecem como estão.
R1. ZERO INVENÇÃO — todo número, percentagem, nome de empresa ou resultado deve aparecer LITERALMENTE no texto abaixo. Se não está no texto, não escreva. Sem dado no texto = sem número no slide.
R2. REESCRITA EDITORIAL, NÃO PARÁFRASE — o objetivo NÃO é "dizer a mesma coisa com outras palavras
    parecidas": é EXPLICAR o fato como um professor explicaria para alguém curioso, com foco didático.
    Isso significa: reordenar a informação (o que importa primeiro, não a ordem da matéria original),
    adicionar o "e daí" (por que isso importa, o que muda na prática) que a matéria-fonte às vezes só
    implica, e nunca reaproveitar a construção de frase do original (mesmos verbos + mesma ordem de
    sujeito/complemento) só trocando um substantivo. NENHUMA sequência de 6+ palavras do artigo pode
    aparecer idêntica nos slides/legenda — nem uma frase inteira "traduzida" palavra por palavra.
    RUIM (paráfrase superficial — mesma estrutura, só sinônimos): fonte "A empresa lançou o produto
    nesta terça-feira" → slide "A companhia apresentou o produto na terça" (é a MESMA frase).
    BOM (reescrita editorial real): fonte "A empresa lançou o produto nesta terça-feira" → slide
    "Depois de meses de teste fechado, a novidade chega ao público — e muda o cálculo de quem hoje
    paga por uma ferramenta concorrente" (mesmo fato, ângulo e construção completamente diferentes).
R3. LEAD ESPECÍFICO — o lead nunca copia o nome do slot ("Causa e Contexto", "Fato Central") NEM os exemplos de estilo do arco abaixo (são fictícios, só ilustram o padrão). Um lead genérico o bastante para caber em QUALQUER notícia de ${niche} está ERRADO — ele deve conter uma palavra ou ideia que só existe NESTA notícia (um nome, um verbo de ação concreto, o objeto específico do fato).
R4. BODY MÍNIMO ${target.minWordsPerSlide} PALAVRAS — slides com body curto serão descartados. Desenvolva o argumento completo; não apenas enuncie o fato.
R5. SLIDE FINAL OBRIGATÓRIO — o último slide DEVE conter: (1) pergunta que force posição real + (2) o CTA exato: "Siga ${handle} para não perder o que vale a sua atenção em ${niche}."
${learnedGuidanceSection}
════ ARCO NARRATIVO — siga esta ordem ════
${buildNarrativeArc(target.slideCount, handle, niche)}

REGRA DE CONEXÃO (open loop): lido em sequência, o carrossel deve soar como alguém construindo um raciocínio — não como tópicos avulsos de apresentação. Cada slide termina deixando uma pergunta aberta que o PRÓXIMO slide responde — não anuncie tudo já no slide 1; o "ARRASTAR »" do rodapé só funciona se o conteúdo puxar o leitor adiante. Use transições que conectam: "Por trás disso está...", "O que isso muda na prática é...", "A pergunta que fica é...".

════ VOCABULÁRIO PROIBIDO ════
"especialistas alertam", "tendência cresce", "o setor se transforma", "a IA avança", "cada vez mais empresas", "novas possibilidades", "impacto significativo", "muda a forma como", "representa um avanço", "novas fronteiras".
Frases sem sujeito concreto: "estudos mostram", "segundo relatórios", "isso representa".
NUNCA invente percentagens ou benchmarks ("94%", "87%", "90%") que não apareçam no texto.

════ ESPECIFICAÇÃO DOS CAMPOS ════

▸ shortTitle — manchete de CAPA, e também o GANCHO (5 a 9 palavras, sem ponto final):
  A capa precisa ser manchete factual E gancho: verdadeira E impossível de ignorar. Escolha
  UMA das 6 fórmulas abaixo — a que o FATO REAL do texto sustentar (nunca force uma fórmula
  sobre um fato que não a sustenta):
    1. Número que ancora — o dado real como protagonista (só se o número existir no texto).
    2. Curiosity gap — promete uma resposta que só o carrossel entrega, sem clickbait vazio.
    3. Contraste antes/depois — a mudança de estado.
    4. O que está em jogo — a consequência concreta para o leitor.
    5. Contraintuitivo — quebra uma expectativa comum, sem mentir.
    6. Pergunta específica — a pergunta que o decisor está realmente se fazendo.
  Regras: frase completa com sujeito e verbo (nunca um rótulo). Uma promessa clara — o leitor
  sabe o que vai ganhar ao deslizar. A promessa é SEMPRE cumprida dentro do carrossel —
  curiosity gap que não entrega queima confiança e é proibido. Teste dos 3 segundos: um
  estranho entende o assunto e sente vontade de deslizar em 3 segundos?
  BOM: "Meta abre modelo de IA de código aberto para empresas" (o que está em jogo)
  BOM: "Pesquisadores reduzem custo de LLM em 70% com nova técnica" (número que ancora)
  RUIM: "Nova IA supera rivais em 94% dos testes" (número inventado — viola R1)
  RUIM: "IA avança e muda o mercado de tecnologia" (genérico, cabe em qualquer notícia)
  RUIM: "O segredo que ninguém te contou sobre essa IA" (curiosity gap vazio — o carrossel
        não tem segredo nenhum; promete e não cumpre)

▸ slides — EXATAMENTE ${target.slideCount} objetos, um por slot do arco:

  Campos obrigatórios em todo slide:
  • "slideType" — arquétipo: "context" | "stat" | "comparison" | "quote" | "closing"
  • "eyebrow"   — rótulo Mono uppercase específico ao conteúdo (ex.: "O QUE ACONTECEU").
                  NUNCA genérico: "Detalhes", "Mais informações", "Saiba mais" são proibidos.
                  NUNCA igual ao eyebrow de outro slide do mesmo carrossel.
  • "lead"      — 2 a 5 palavras, específico ao conteúdo deste slide.
                  PROIBIDO (R3): copiar o nome do slot, o shortTitle, ou os exemplos do arco.
                  RUIM: "Causa e Contexto", "Impacto Prático", "Fato Central" (nomes de slot — proibido)
                  RUIM: "Inovação", "Tecnologia", "Saiba mais" (genérico — proibido)
                  BOM: "O problema real", "A raiz disso", "Na prática", "Os números", "Vale debater"
  • "body"      — MÍNIMO ${target.minWordsPerSlide} palavras, MÁXIMO ${target.maxWordsPerSlide} (R4).
                  Prosa fluida — frases que constroem argumento. Nunca tópicos em parágrafo.
                  ⚠️ Body curto = slide falho. O lead anuncia o tema; o body desenvolve o argumento.

                  Compare os dois exemplos abaixo — use os dados REAIS da notícia, nunca estes fatos:

                  RUIM (muito curto — apenas enuncia, não desenvolve):
                    "Publish AI lançou um contrato para respostas de IA. Isso evita alucinações."

                  BOM (mínimo ${target.minWordsPerSlide} palavras — fato + causa + consequência):
                    "Publish AI lançou o Typed Answer Contract — uma estrutura que exige que cada resposta
                    seja um objeto com campos tipados e verificáveis, não texto livre. Por trás disso está
                    um problema antigo: modelos preenchem lacunas com informações plausíveis mas falsas
                    quando a pergunta vai além do texto disponível. Com o contrato, cada campo da resposta
                    precisa de uma citação do contexto original — sem citação, o campo fica vazio em vez
                    de inventado, tornando o erro visível e corrigível."

  Campos condicionais (inclua APENAS quando o arquétipo exige e os dados existem no texto):
  • "stat"       — obrigatório se slideType == "stat":
      { "value": "<número literal do texto>", "label": "<o que mede>", "supporting": "<opcional>" }
      NUNCA invente o valor (R1). Sem número no texto = sem slideType "stat".
  • "comparison" — obrigatório se slideType == "comparison":
      { "leftLabel": "...", "leftValue": "...", "leftDetail": "...",
        "rightLabel": "...", "rightValue": "...", "rightDetail": "..." }
      Colunas simétricas em extensão. leftDetail/rightDetail opcionais.
  • "quote"      — obrigatório se slideType == "quote":
      { "text": "...", "author": "<nome real da matéria>", "role": "<cargo/organização>" }
      Atribuição a pessoa e cargo REAIS da matéria (R1). Nunca "especialistas".
      Se a fala original estiver em inglês, TRADUZA para PT-BR (R0) — "text" nunca fica em inglês.

  Estruturas de body — use conforme o que o texto sustentar:
  • ANTES × DEPOIS: o que existia → o que mudou → o que representa para o leitor
  • CONSEQUÊNCIA EM CADEIA: fato → o que decorre → o que significa na prática
  • ANALOGIA PROFISSIONAL: frame técnico ancorado em algo que o leitor já conhece

▸ caption — legenda (${target.captionSentences.min} a ${target.captionSentences.max} frases, MÍNIMO ${target.captionMinChars} caracteres):
  Frase 1: afirmação FACTUAL forte com o dado principal. NUNCA comece com pergunta.
  Frases 2–N: consequência prática para quem trabalha com ${niche}. Use os números do texto.
  Penúltima frase: dado de contexto, comparação com estado anterior ou repercussão.
  Última frase: pergunta que force uma posição real no leitor.
  Última linha obrigatória: "Fonte: ${item.source}".

▸ hashtags — 5 a 8 tags (sem #, sem espaços):
  Misture amplas (InteligenciaArtificial, MachineLearning) e específicas desta notícia.
  Nunca repita conceitos com variação mínima.

════ NOTÍCIA ════
⚠️ Escreva EXCLUSIVAMENTE sobre o assunto abaixo. Não misture com outros produtos, empresas ou benchmarks que você conheça.
Título: ${item.title}
Fonte: ${item.source}
Conteúdo:
${sourceText}
${corroboratingSourcesSection}
ANTES DE ESCREVER O JSON, verifique mentalmente:
□ R0: Todo o texto está em Português Brasileiro — incluindo "quote.text" e qualquer trecho vindo de fontes correlatas em inglês? Nenhuma palavra em inglês sobrou sem tradução?
□ Tenho EXATAMENTE ${target.slideCount} slides?
□ Cada body tem PELO MENOS ${target.minWordsPerSlide} palavras? (R4)
□ Nenhum lead copia o nome do slot, o shortTitle ou os exemplos de estilo? (R3)
□ O último slide tem slideType "closing", eyebrow "RESUMO", a pergunta real E o CTA "Siga ${handle}..."? (R5)
□ Nenhum dado inventado — todo número, citação e comparação vem literalmente do texto? (R1)
□ R2: reli cada slide contra a fonte — nenhuma sequência de 6+ palavras é idêntica ao texto original? A construção da frase (ordem sujeito/verbo/complemento) é MINHA, não a do artigo?
□ Nenhum eyebrow é genérico ("Detalhes", "Mais informações") nem repetido no mesmo carrossel?
□ Todo slideType "stat" tem o campo "stat" com value, label? (sem número no texto = sem "stat")
□ Todo slideType "quote" tem "quote" com author e role reais da matéria, e "text" já traduzido para PT-BR?
□ Nenhum slide repete o mesmo arquétipo mais de 2 vezes seguidas — usei estatística/comparação/citação quando o arco sugeriu, não só contexto?
□ Salvaria? Tem algo para reler/usar depois?
□ Enviaria? Eu mandaria para um colega específico?
□ Cada slide de contexto responde ao "e daí" (por que importa para quem decide)?
□ A capa passa no teste dos 3 segundos, sem clickbait vazio (a promessa é cumprida)?
□ Há um framework reconhecível (PAS/BAB/AIDA), não fatos soltos?
□ O fechamento tem UM CTA primário (salvar/enviar/comentar) + o "siga"?

RESPONDA APENAS COM JSON VÁLIDO (sem texto fora do JSON):
{
  "shortTitle": "...",
  "slides": [
    ${slidesPlaceholder}
  ],
  "caption": "...",
  "hashtags": ["...", "..."]
}

Nota: slides com slideType "stat" devem incluir o campo "stat": {...}.
      slides com slideType "comparison" devem incluir "comparison": {...}.
      slides com slideType "quote" devem incluir "quote": {...}.
      Omita os campos condicionais nos demais arquétipos.`;
}

/** Extrai um array de strings de um campo JSON desconhecido. */
function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * Faz o parse + sanitização da resposta JSON do LLM. Tolera cercas de markdown.
 * Em falha de parse, devolve um fallback mínimo creditando a fonte.
 */
export function parseLlmJson(text: string, source: string): LlmOutput {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "");
  try {
    const json = JSON.parse(clean) as Record<string, unknown>;
    return sanitizeLlmOutput({
      shortTitle:
        typeof json["shortTitle"] === "string" ? json["shortTitle"] : "Notícia",
      caption:
        typeof json["caption"] === "string"
          ? json["caption"]
          : `Fonte: ${source}`,
      hashtags: asStringArray(json["hashtags"]),
      slides: parseSlideContentArray(json["slides"]),
    });
  } catch {
    return {
      shortTitle: "Notícia",
      caption: `Fonte: ${source}`,
      hashtags: [],
      slides: [],
    };
  }
}
