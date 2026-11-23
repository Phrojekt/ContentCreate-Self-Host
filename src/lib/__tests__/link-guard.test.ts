import { describe, expect, it } from "vitest";

import { isPublicHttpUrl, sourceNameFromUrl } from "@/lib/link-guard";

describe("isPublicHttpUrl (DEC-026)", () => {
  it.each([
    "https://tecnoblog.net/noticias/ia",
    "http://exame.com/tecnologia/x?utm=1",
    "https://8.8.8.8/x",
  ])("aceita %s", (url) => expect(isPublicHttpUrl(url)).toBe(true));

  it.each([
    "ftp://exame.com/x",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "http://localhost:3000/api",
    "http://127.0.0.1/",
    "http://10.0.0.5/",
    "http://192.168.0.1/",
    "http://172.20.1.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://intranet/",
    "https://user:pass@exame.com/",
    "não é url",
  ])("recusa %s", (url) => expect(isPublicHttpUrl(url)).toBe(false));

  it("fonte = domínio sem www", () => {
    expect(sourceNameFromUrl("https://www.tecmundo.com.br/a")).toBe(
      "tecmundo.com.br",
    );
  });
});
