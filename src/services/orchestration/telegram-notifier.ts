import { AppError } from "@/lib/errors";
import type { Notifier, NotifyMessage } from "@/types";

type FetchFn = typeof fetch;

/**
 * Notifica via Telegram Bot API. Token e chat só vêm de env, server-side
 * (DEC-012) — nunca aparecem em mensagens de erro.
 */
export class TelegramNotifier implements Notifier {
  readonly id = "telegram";

  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async notify(message: NotifyMessage): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: `${message.title}\n\n${message.body}`,
      }),
    });

    if (!res.ok) {
      // Não inclui a URL (contém o token) na mensagem.
      throw new AppError(
        `Telegram respondeu HTTP ${res.status}.`,
        502,
        "TELEGRAM_HTTP_ERROR",
      );
    }
  }
}
