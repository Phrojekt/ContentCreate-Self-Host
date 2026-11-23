import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST as resetPOST } from "@/app/api/settings/reset/route";
import { PATCH as settingsPATCH } from "@/app/api/settings/route";
import { POST as testFeedPOST } from "@/app/api/settings/test-feed/route";
import { prisma } from "@/lib/prisma";
import { buildPrompt } from "@/services/llm/prompt";
import { defaultSettings } from "@/lib/settings-schema";
import {
  getEffectiveSettings,
  saveSettings,
} from "@/services/settings/settings-store";

const db = prisma.appSettings;
const req = (method: string, body: unknown) =>
  new Request("http://x", { method, body: JSON.stringify(body) });

describe("settings-store", () => {
  beforeEach(() => vi.resetAllMocks());

  it("erro de banco → padrão (fail-safe, a esteira não cai)", async () => {
    vi.mocked(db.findUnique).mockRejectedValue(new Error("db fora"));
    expect(await getEffectiveSettings()).toEqual(defaultSettings());
  });

  it("salvar mescla a seção sobre o efetivo e grava JSON validado", async () => {
    vi.mocked(db.findUnique).mockResolvedValue(null);
    const out = await saveSettings({
      profile: {
        brandName: "Saúde+",
        handle: "saude",
        network: "linkedin",
        niche: "Saúde digital",
      },
    });
    expect(out.profile.handle).toBe("@saude");
    expect(out.feeds).toEqual(defaultSettings().feeds);
    const data = JSON.parse(vi.mocked(db.upsert).mock.calls[0]![0].create.data);
    expect(data.profile.niche).toBe("Saúde digital");
  });
});

describe("rotas /api/settings", () => {
  beforeEach(() => vi.resetAllMocks());

  it("PATCH inválido → 400 sem gravar", async () => {
    const res = await settingsPATCH(
      req("PATCH", { colors: { ...defaultSettings().colors, title: "azul" } }),
    );
    expect(res.status).toBe(400);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("reset apaga o registro e devolve o padrão", async () => {
    const res = await resetPOST();
    expect(db.deleteMany).toHaveBeenCalled();
    expect((await res.json()).settings).toEqual(defaultSettings());
  });

  it("testar feed recusa endereço privado", async () => {
    const res = await testFeedPOST(
      req("POST", { url: "http://192.168.0.1/rss" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("prompt com perfil personalizado (DEC-027)", () => {
  const item = {
    title: "Notícia",
    summary: "Resumo da notícia com fatos suficientes para o teste. ".repeat(
      10,
    ),
    url: "https://x.com/a",
    canonicalUrl: "https://x.com/a",
    source: "X",
    publishedAt: new Date(),
  };

  it("usa marca, @, rede e nicho do perfil no lugar dos fixos", () => {
    const p = buildPrompt(item, {
      brandName: "Fin",
      handle: "@fin.br",
      networkLabel: "LinkedIn",
      niche: "Finanças pessoais",
    });
    expect(p).toContain(
      'o CTA exato: "Siga @fin.br para não perder o que vale a sua atenção em Finanças pessoais."',
    );
    expect(p).toContain("carrossel LinkedIn");
    expect(p).toContain("domina Finanças pessoais");
    expect(p).not.toContain("IA & Dados");
  });

  it("sem perfil, o prompt continua com o padrão de config/", () => {
    expect(buildPrompt(item)).toContain("Siga @ia.e.dados");
  });
});
