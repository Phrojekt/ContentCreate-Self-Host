# ContentCreate

Esteira **self-hosted** que transforma notícias em carrosséis prontos para redes sociais.
Você roda na sua máquina, conecta a sua IA (Ollama local ou Anthropic), define o seu nicho — e a
esteira coleta notícias, escreve os rascunhos com crédito à fonte e gera as imagens dos slides.
**Nada é publicado sozinho:** cada post passa pela sua revisão antes de ser exportado.

```
Coleta (RSS / API) → Filtro, dedup e seleção → IA escreve o carrossel → Você revisa → Exporta imagens + legenda
```

A interface é em português (pt-BR) e o conteúdo gerado também.

---

## Sumário

- [Como funciona](#como-funciona)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Escolhendo a IA](#escolhendo-a-ia)
- [Configurando o seu nicho](#configurando-o-seu-nicho)
- [Usando a interface](#usando-a-interface)
- [Rodando a esteira](#rodando-a-esteira)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Comandos](#comandos)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Uso responsável](#uso-responsável)

---

## Como funciona

1. **Coleta** — lê os feeds RSS cadastrados (e, opcionalmente, uma API de notícias) e busca o texto
   de cada matéria.
2. **Filtro e seleção** — descarta o que já foi processado, o que não tem as palavras do seu tema ou
   tem palavras bloqueadas, e remove duplicatas (por título e, com Ollama, por similaridade
   semântica). Fica com as notícias mais recentes e relevantes (até 15 por rodada, das últimas 72 h).
3. **Escrita** — a IA reescreve cada notícia como um carrossel (capa + slides + legenda + hashtags),
   com as suas palavras e **creditando a fonte**. Um verificador confere as regras de conteúdo e pede
   nova tentativa quando a qualidade fica abaixo do mínimo. Uma memória de exemplos e lições
   (aprendida com o que você aprova e descarta) orienta as próximas gerações.
4. **Revisão** — os rascunhos ficam pendentes na interface. Você aprova, edita ou descarta.
5. **Exportação** — ao aprovar, o post é renderizado (PNG 1080×1350 por slide) e salvo em
   `output/<id>/` com `caption.txt` e `post.json`. A publicação na rede é feita por você (ou pelo
   agendador que preferir).

## Requisitos

- **Node.js 20.9+** e npm
- **Docker** (o banco é Postgres 17 + pgvector, em container)
- **Uma IA:** [Ollama](https://ollama.com) rodando localmente **ou** uma chave da Anthropic

## Instalação

```bash
git clone <url-deste-repositório> contentcreate
cd contentcreate
cp .env.example .env          # ajuste se precisar (ver "Escolhendo a IA")
npm install
npm run db:up                 # sobe o Postgres na porta 5439
npx prisma migrate deploy     # cria as tabelas
npm run prisma:generate       # gera o client do Prisma
npm run dev
```

Abra <http://localhost:3000>. No Windows (PowerShell), use `Copy-Item .env.example .env` no lugar do
`cp`.

> A porta 5439 foi escolhida para não colidir com um Postgres que você já tenha na 5432. Se mudar
> em `docker-compose.yml`, ajuste também o `DATABASE_URL`.

## Escolhendo a IA

A escolha é feita no `.env`:

| Situação                 | Provedor usado                                                           |
| ------------------------ | ------------------------------------------------------------------------ |
| `LLM_API_KEY` preenchida | **Anthropic** — Claude Haiku 4.5 (pago por token)                        |
| `LLM_API_KEY` vazia      | **Ollama** local — gratuito, modelo `OLLAMA_MODEL` (padrão `qwen2.5:7b`) |

### Ollama (local, gratuito)

```bash
ollama pull qwen2.5:7b          # escreve os posts (~8 GB de VRAM)
ollama pull nomic-embed-text    # deduplicação semântica e memória
ollama serve
```

- Sem GPU ou com pouca memória: `OLLAMA_MODEL=qwen2.5:3b`.
- Mais qualidade, se a máquina aguentar: `OLLAMA_MODEL=qwen2.5:14b`.
- Ollama em outra máquina da rede: `OLLAMA_URL=http://ip-da-maquina:11434`.
- Qualquer modelo de chat do Ollama funciona; os de 7B ou mais seguem melhor as regras de formato.

### Anthropic

Preencha `LLM_API_KEY` com a sua chave. O modelo de embeddings continua vindo do Ollama: se ele não
estiver rodando, a esteira funciona normalmente, só sem a deduplicação semântica e sem a busca na
memória.

> Hoje esses são os dois provedores suportados. Toda chamada de IA passa pela interface
> `LlmProvider` (`src/services/llm/llm-provider.ts`), então outro provedor entra como uma nova
> implementação dela, ligada em `src/services/orchestration/index.ts`.

## Configurando o seu nicho

O projeto vem configurado como exemplo para o nicho **IA & Dados**. Você pode trocar tudo pela
interface ou direto nos arquivos de `config/`.

### Pela interface

| Tela           | O que você edita                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Identidade** | Nome da marca, @ do perfil, rede social, tema/nicho (entra no prompt), cores do post e categorias (rótulo, cor de destaque e palavras que ativam cada uma). Mostra uma prévia ao vivo do slide. |
| **Fontes**     | Feeds RSS (adicionar, testar, pausar, remover), palavras do tema (obrigatórias) e palavras bloqueadas.                                                                                          |

O que você salva na interface fica no banco e vale a partir da próxima rodada/prévia. **Restaurar
padrão de fábrica** volta aos valores de `config/`.

### Pelo código (`config/`)

Os arquivos de `config/` são o **padrão de fábrica** — o que a interface mostra antes de você salvar
qualquer coisa — e guardam o que a interface ainda não edita:

| Arquivo                       | Conteúdo                                                                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/project.config.ts`    | Nome do tema, marca, @, cores e fonte; formato do post (`portrait` 1080×1350 ou `square` 1080×1080) e máximo de slides; quantas notícias por rodada e janela de recência; limiares de deduplicação; liga/desliga memória; dias até excluir descartados; tabela de custo por provedor. |
| `config/sources.ts`           | Feeds RSS padrão e as queries da API de notícias (`newsApiQueries`, vazias por padrão).                                                                                                                                                                                               |
| `config/keywords.ts`          | Palavras do tema e palavras bloqueadas padrão.                                                                                                                                                                                                                                        |
| `config/procedural-memory.ts` | Regras de estilo que a IA consulta antes de escrever (voz, vocabulário a evitar etc.).                                                                                                                                                                                                |
| `config/episodic-seed.ts`     | Carrosséis-exemplo completos usados como referência de padrão (few-shot).                                                                                                                                                                                                             |

Para um nicho novo, o caminho mais curto é: ajustar **Identidade** e **Fontes** na interface e, se
quiser ir além, reescrever `procedural-memory.ts` e `episodic-seed.ts` com exemplos do seu tema. O
layout dos slides é fixo e vive em `src/services/rendering/`.

## Usando a interface

- **Início** — resumo da última rodada, fila de revisão e números da semana. Botões **Rodar esteira
  agora** e **Gerar post a partir de um link** (cola a URL de uma matéria e gera o rascunho dela).
- **Revisão** — os rascunhos pendentes com a prévia dos slides, a nota do verificador e as
  verificações automáticas. Atalhos: `J`/`K` navegam, `←`/`→` trocam de slide, `A` aprova,
  `E` edita, `R` descarta (pedindo o motivo, que vira lição na Memória).
- **Editor** — edita texto e tipo de cada slide e a legenda, com salvamento automático. O assistente
  sugere uma nova versão de um slide; você decide se usa.
- **Agenda** — posts aprovados prontos para publicar: copiar legenda (com hashtags), baixar imagens e
  marcar como publicado. Visão por semana.
- **Descartados** — devolver à revisão ou excluir de vez. Descartados são excluídos automaticamente
  após 30 dias; as lições continuam na Memória.
- **Memória** — o que a IA consulta: regras de `config/`, exemplos aprovados e lições de descarte.
  Dá para buscar e desativar/reativar entradas (nada é apagado).
- **Esteira** — as etapas, quando o agendador roda, se o Telegram está ligado e o histórico de
  rodadas.
- **Identidade** e **Fontes** — ver [Configurando o seu nicho](#configurando-o-seu-nicho).

## Rodando a esteira

Três formas, todas com a mesma trava (duas rodadas nunca correm ao mesmo tempo):

1. **Pela interface** — botão **Rodar esteira agora** no Início.
2. **Pelo terminal** — `npm run pipeline:run`.
3. **Agendada** — `npm run scheduler:start` deixa um processo rodando a esteira conforme
   `PIPELINE_CRON` (padrão: todo dia às 08:00). Com `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`, você
   recebe um aviso quando há rascunhos novos ou quando algo falha.

Com Ollama em CPU, uma rodada pode levar vários minutos.

## Variáveis de ambiente

Todas são lidas só no servidor e validadas em `src/lib/env.ts`. Veja `.env.example`.

| Variável             | Obrigatória | Padrão                       | Para quê                                            |
| -------------------- | ----------- | ---------------------------- | --------------------------------------------------- |
| `DATABASE_URL`       | sim         | Postgres do `docker-compose` | Conexão com o banco                                 |
| `LLM_API_KEY`        | não         | —                            | Chave da Anthropic; sem ela, usa Ollama             |
| `OLLAMA_URL`         | não         | `http://localhost:11434`     | Endereço do Ollama                                  |
| `OLLAMA_MODEL`       | não         | `qwen2.5:7b`                 | Modelo que escreve os posts                         |
| `OLLAMA_EMBED_MODEL` | não         | `nomic-embed-text`           | Embeddings (dedup semântica e memória)              |
| `OLLAMA_TIMEOUT_MS`  | não         | `120000`                     | Timeout por chamada                                 |
| `OLLAMA_NUM_CTX`     | não         | `8192`                       | Janela de contexto                                  |
| `OLLAMA_KEEP_ALIVE`  | não         | `10m`                        | Tempo que o modelo fica carregado                   |
| `NEWS_API_KEY`       | não         | —                            | Chave do newsapi.org, gnews.io ou newsdata.io       |
| `PUBLISH_OUTPUT_DIR` | não         | `./output`                   | Pasta dos pacotes exportados                        |
| `PIPELINE_CRON`      | não         | `0 8 * * *`                  | Horário do agendador                                |
| `TELEGRAM_BOT_TOKEN` | não         | —                            | Notificações (precisa do `TELEGRAM_CHAT_ID` também) |
| `TELEGRAM_CHAT_ID`   | não         | —                            | Chat que recebe as notificações                     |

## Comandos

| Comando                       | O que faz                                                        |
| ----------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                 | Interface em modo desenvolvimento (porta 3000)                   |
| `npm run build` / `npm start` | Build e servidor de produção                                     |
| `npm run pipeline:run`        | Roda a esteira uma vez                                           |
| `npm run scheduler:start`     | Agendador (cron) da esteira                                      |
| `npm run preview:drafts`      | Renderiza todos os rascunhos pendentes em `output/preview/`      |
| `npm run render:sample`       | Gera slides de teste com casos extremos em `tmp/render-samples/` |
| `npm run db:up` / `db:down`   | Sobe / derruba o Postgres                                        |
| `npm run prisma:migrate`      | Cria e aplica migrations em desenvolvimento                      |
| `npm run test:run`            | Testes (Vitest)                                                  |
| `npm run typecheck` / `lint`  | Checagem de tipos / lint                                         |

## Estrutura do projeto

```
config/                 padrões do nicho (tema, fontes, palavras, memória inicial)
prisma/                 schema e migrations do banco
scripts/                CLIs: rodar esteira, agendador, prévias
src/app/                interface (Next.js App Router) e rotas de API
src/components/         componentes da interface
src/services/
  collection/           RSS e APIs de notícias
  processing/           filtro, deduplicação, seleção
  llm/                  provedores de IA, prompt e verificações de qualidade
  memory/ embedding/    memória de exemplos/lições e embeddings
  rendering/            template dos slides (Satori → PNG)
  publishing/           aprovação e exportação do pacote
  orchestration/        execução, agendador e notificações
```

Stack: Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL 17 + pgvector, Satori/resvg, Vitest.

Os hooks do Git (Husky) rodam lint/format no commit, **bloqueiam commits com `.env` ou com algo que
pareça chave de API**, e rodam typecheck + testes antes do push.

## Uso responsável

- A esteira **nunca reproduz a matéria na íntegra**: o prompt exige reescrita com palavras próprias e
  crédito à fonte em cada post. Mesmo assim, revise antes de publicar — a responsabilidade pelo que
  vai ao ar é de quem publica.
- Prefira feeds RSS oficiais dos veículos e respeite os termos de uso de cada fonte.
- Suas chaves ficam só no seu `.env`, que não é versionado.
