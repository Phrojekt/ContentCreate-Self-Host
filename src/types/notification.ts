// Contrato de notificação (Bloco 5 — Orquestração). A esteira avisa o dono em
// geração e falha; o canal concreto fica atrás da interface (DEC-005).

export type NotifyLevel = "info" | "error";

export interface NotifyMessage {
  level: NotifyLevel;
  title: string;
  body: string;
}

/** Fronteira de notificação. Implementações: `TelegramNotifier`, `NoopNotifier`. */
export interface Notifier {
  readonly id: string;
  notify(message: NotifyMessage): Promise<void>;
}
