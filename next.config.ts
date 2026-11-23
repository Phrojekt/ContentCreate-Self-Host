import type { NextConfig } from "next";

// Headers de segurança aplicados a todas as rotas (architecture.md — Segurança).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Pacotes server-only que não devem ser empacotados pelo bundler
  // (nativos/Node): driver SQLite, client Prisma, logger e o renderer de imagem
  // (resvg é binário nativo; satori carrega yoga/wasm).
  serverExternalPackages: [
    "pino",
    "pino-pretty",
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
    "@resvg/resvg-js",
    "satori",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
