import { logger } from "@/lib/logger";
import type { Notifier, NotifyMessage } from "@/types";

/**
 * Notifier de fallback: não envia para canal externo, apenas loga. Usado quando
 * o Telegram (ou outro canal) não está configurado no env.
 */
export class NoopNotifier implements Notifier {
  readonly id = "noop";

  async notify(message: NotifyMessage): Promise<void> {
    logger.info({ level: message.level, title: message.title }, message.body);
  }
}
