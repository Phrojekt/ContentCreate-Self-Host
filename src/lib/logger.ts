import pino from "pino";

import { env } from "@/lib/env";

/**
 * Logger estruturado (pino) — usado server-side na esteira e nas rotas.
 * Em desenvolvimento usa `pino-pretty` (saída legível e colorida); em produção
 * emite JSON estruturado.
 */
const isDev = env.NODE_ENV === "development";

export const logger = pino({
  level: isDev ? "debug" : "info",
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

export type Logger = typeof logger;
