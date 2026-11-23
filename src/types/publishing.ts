// Contratos do Bloco 4 (Publicação). 4A entrega o pacote a um agendador/pasta;
// 4B (Graph API) entra no P3, atrás da mesma interface (DEC-010).

import type { PostPackage } from "./post";

/** Metadados da entrega (de onde veio o pacote). */
export interface PublishMeta {
  draftId: string;
}

/** Resultado de uma publicação/entrega. */
export interface PublishResult {
  /** Identificador do destino (ex.: "scheduler:filesystem"). */
  target: string;
  /** Onde o pacote foi entregue (ex.: caminho da pasta de saída). */
  location: string;
  /** Arquivos gerados na entrega. */
  files: string[];
}

/**
 * Fronteira de publicação (DEC-005). `SchedulerPublisher` (4A) entrega o pacote
 * para um agendador/pasta; `GraphApiPublisher` (4B) publica direto — depois.
 * Nunca publica sozinho sem aprovação humana (DEC-011).
 */
export interface Publisher {
  readonly id: string;
  publish(pkg: PostPackage, meta: PublishMeta): Promise<PublishResult>;
}
