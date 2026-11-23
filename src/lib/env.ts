import { z } from "zod";

/**
 * Variáveis de ambiente validadas (DEC-012).
 *
 * Tudo que é segredo entra aqui, server-side, validado por Zod. Nada pode ter
 * prefixo NEXT_PUBLIC_ (chaves nunca vão ao cliente). O boot falha cedo, com
 * mensagem clara, se algo obrigatório faltar ou estiver inválido.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // OBRIGATÓRIA. Postgres em dev (via Docker, `docker-compose.yml`) e produção
  // (DEC-003, paridade dev/prod). O default evita quebra no boot sem `.env`.
  DATABASE_URL: z
    .string()
    .min(1)
    .default(
      "postgresql://contentcreate:contentcreate@localhost:5439/contentcreate?schema=public",
    ),

  // Opcionais no P0. Tornar OBRIGATÓRIAS (ex.: `z.string().min(1)`) quando os
  // blocos correspondentes forem implementados:
  //   - NEWS_API_KEY: Bloco 1 (Coleta)
  //   - LLM_API_KEY:  Bloco 2 (Resumo/Reescrita)
  NEWS_API_KEY: z.string().optional(),
  LLM_API_KEY: z.string().optional(),

  // Bloco 4 (Publicação 4A): pasta de saída do agendador. Opcional — default em
  // src/constants/publishing.ts (`./output`).
  PUBLISH_OUTPUT_DIR: z.string().optional(),

  // Ollama (LLM local, sem custo de API). Usado quando LLM_API_KEY não está
  // configurado. OLLAMA_URL default: http://localhost:11434 (ollama serve).
  // OLLAMA_MODEL default: qwen2.5:7b.
  OLLAMA_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().optional(),
  // Modelo de embeddings p/ dedup semântica (default: nomic-embed-text).
  OLLAMA_EMBED_MODEL: z.string().optional(),
  // Timeout por chamada ao Ollama em ms (default: 120 000 = 2 min).
  // Aumente se o modelo for grande e rodar em CPU lento.
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  // Janela de contexto (tokens). Default 8192 — suficiente p/ o prompt+artigo e
  // ENXUTO o bastante p/ o KV-cache caber na VRAM (evita transbordo p/ RAM/PCIe,
  // que é o que trava a inferência). Não aumente sem necessidade.
  OLLAMA_NUM_CTX: z.coerce.number().int().positive().optional(),
  // Mantém o modelo carregado na VRAM entre chamadas (evita recarregar a cada
  // item/rodada). Aceita "10m", "1h", "0" (descarrega na hora). Default "10m".
  OLLAMA_KEEP_ALIVE: z.string().optional(),

  // Bloco 5 (Orquestração). Todos opcionais:
  //   - TELEGRAM_*: se ambos presentes, a esteira notifica via Telegram; senão,
  //     só loga (NoopNotifier).
  //   - PIPELINE_CRON: expressão cron do agendador (default em
  //     src/constants/orchestration.ts).
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  PIPELINE_CRON: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detalhes = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Variáveis de ambiente inválidas:\n${detalhes}\n\n` +
      "Confira o seu .env (use .env.example como referência).",
  );
}

export const env = parsed.data;
export type Env = typeof env;
