import { describe, expect, it, vi } from "vitest";

import { TelegramNotifier } from "@/services/orchestration/telegram-notifier";
import type { NotifyMessage } from "@/types";

const message: NotifyMessage = {
  level: "info",
  title: "✅ Esteira concluída",
  body: "Rascunhos criados: 3",
};

function okResponse(): Response {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

describe("TelegramNotifier", () => {
  it("posta em sendMessage com chat_id e texto combinando título+corpo", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const notifier = new TelegramNotifier("TOKEN", "CHAT", fetchFn);

    await notifier.notify(message);

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toContain("api.telegram.org/botTOKEN/sendMessage");
    const body = JSON.parse((init as RequestInit).body as string) as {
      chat_id: string;
      text: string;
    };
    expect(body.chat_id).toBe("CHAT");
    expect(body.text).toContain("Esteira concluída");
    expect(body.text).toContain("Rascunhos criados: 3");
  });

  it("lança erro em resposta não-ok, sem vazar o token", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 401 }));
    const notifier = new TelegramNotifier("SECRET-TOKEN", "CHAT", fetchFn);

    await expect(notifier.notify(message)).rejects.toThrow(/HTTP 401/);
    await expect(notifier.notify(message)).rejects.not.toThrow(/SECRET-TOKEN/);
  });
});
